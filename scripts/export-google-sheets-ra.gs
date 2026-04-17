/**
 * ============================================================================
 * Google Sheets Risk Assessment Exporter — Google Apps Script
 * ============================================================================
 *
 * PURPOSE:
 *   Exports risk assessments from Google Sheets into the JSON format expected
 *   by the hacmandocs Risk Assessment import endpoint:
 *     POST /api/risk-assessments/import
 *
 * EXPECTED SHEET STRUCTURE:
 *   Each sheet tab = one tool's risk assessment.
 *   The sheet name is used as the tool name (must match exactly in hacmandocs).
 *
 *   Row 1:  "Tool:" | <tool name>         (optional, overrides sheet name)
 *   Row 2:  "Induction Required:" | Yes/No
 *   Row 3:  "Induction Details:" | <text>  (optional, only if induction required)
 *   Row 4:  "PPE Required:" | <text>
 *   Row 5:  "Before Starting:" | <text>
 *   Row 6:  (blank separator)
 *   Row 7:  Column headers:
 *           Hazard | Who | L | S | R | Rationale | Controls Required | LwC | SwC | RwC
 *   Row 8+: Data rows (R and RwC columns are computed and ignored on import)
 *   Last rows (after blank row):
 *           "Created by/date:" | <name, date>
 *           "Updated by/date:" | <name, date>
 *           "Review by/date:" | <name, date>
 *
 * USAGE:
 *   1. Open https://script.google.com and create a new project.
 *   2. Paste this file into Code.gs.
 *   3. Set SPREADSHEET_ID to your Google Sheet's ID (from the URL).
 *   4. Set SHEET_NAMES to the tab names you want to export, or [] to export all.
 *   5. Run exportRiskAssessments().
 *   6. Check Google Drive for "ra-export.json" and POST it to:
 *        POST /api/risk-assessments/import
 *      with your session token in the Authorization header.
 *
 * ============================================================================
 */

// ── Configuration ────────────────────────────────────────────────────

/** The ID from your Google Sheets URL: /spreadsheets/d/<ID>/edit */
var SPREADSHEET_ID = "YOUR_SPREADSHEET_ID_HERE";

/** Sheet tab names to export. Leave empty [] to export ALL tabs. */
var SHEET_NAMES = [];

// ── Main entry point ─────────────────────────────────────────────────

function exportRiskAssessments() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheets = SHEET_NAMES.length > 0
    ? SHEET_NAMES.map(function(name) { return ss.getSheetByName(name); }).filter(Boolean)
    : ss.getSheets();

  var results = [];
  var errors = [];

  for (var i = 0; i < sheets.length; i++) {
    var sheet = sheets[i];
    try {
      var ra = exportSheet(sheet);
      if (ra) results.push(ra);
    } catch (e) {
      errors.push({ sheet: sheet.getName(), error: e.message });
      Logger.log("ERROR in sheet '" + sheet.getName() + "': " + e.message);
    }
  }

  var output;
  if (results.length === 1) {
    output = results[0];
  } else {
    output = { riskAssessments: results };
  }

  var json = JSON.stringify(output, null, 2);
  DriveApp.createFile("ra-export.json", json, "application/json");
  Logger.log("Saved ra-export.json (" + results.length + " RA(s), " + errors.length + " error(s))");

  if (errors.length > 0) {
    Logger.log("Errors: " + JSON.stringify(errors, null, 2));
  }

  return json;
}

// ── Single sheet export ───────────────────────────────────────────────

function exportSheet(sheet) {
  var name = sheet.getName();
  var data = sheet.getDataRange().getValues();

  if (data.length === 0) {
    Logger.log("SKIP: Sheet '" + name + "' is empty.");
    return null;
  }

  // ── Parse header metadata rows ────────────────────────────────────

  var toolName = name; // default to sheet name
  var inductionRequired = false;
  var inductionDetails = "";
  var ppeRequired = "";
  var beforeStarting = "";
  var headerRowIndex = -1;

  for (var i = 0; i < Math.min(data.length, 10); i++) {
    var cell0 = String(data[i][0] || "").trim().toLowerCase();
    var cell1 = String(data[i][1] || "").trim();

    if (cell0 === "tool:" || cell0 === "tool") {
      toolName = cell1 || name;
    } else if (cell0.startsWith("induction required")) {
      inductionRequired = /yes|true|1/i.test(cell1);
    } else if (cell0.startsWith("induction detail")) {
      inductionDetails = cell1;
    } else if (cell0.startsWith("ppe required") || cell0.startsWith("ppe:")) {
      ppeRequired = cell1;
    } else if (cell0.startsWith("before starting")) {
      beforeStarting = cell1;
    } else if (cell0 === "hazard") {
      // This is the column header row
      headerRowIndex = i;
      break;
    }
  }

  if (headerRowIndex === -1) {
    // Try finding header row by scanning for "hazard" in first column
    for (var j = 0; j < data.length; j++) {
      if (String(data[j][0] || "").trim().toLowerCase() === "hazard") {
        headerRowIndex = j;
        break;
      }
    }
  }

  if (headerRowIndex === -1) {
    Logger.log("WARN: Could not find header row in sheet '" + name + "'. Skipping.");
    return null;
  }

  // ── Map column indices from header row ────────────────────────────

  var headers = data[headerRowIndex].map(function(h) { return String(h || "").trim().toLowerCase(); });
  var colMap = {
    hazard:    findCol(headers, ["hazard"]),
    who:       findCol(headers, ["who", "who might be harmed", "who affected"]),
    l:         findCol(headers, ["l", "likelihood"]),
    s:         findCol(headers, ["s", "severity"]),
    rationale: findCol(headers, ["rationale", "reason", "why"]),
    controls:  findCol(headers, ["controls required", "controls", "control measures"]),
    lwc:       findCol(headers, ["lwc", "likelihood with controls", "l with controls"]),
    swc:       findCol(headers, ["swc", "severity with controls", "s with controls"]),
  };

  if (colMap.hazard === -1) {
    Logger.log("WARN: No 'Hazard' column in sheet '" + name + "'. Skipping.");
    return null;
  }

  // ── Parse data rows ───────────────────────────────────────────────

  var rows = [];
  var metaSection = false;
  var createdBy = "", createdDate = "", updatedBy = "", updatedDate = "", reviewBy = "", reviewDate = "";

  for (var k = headerRowIndex + 1; k < data.length; k++) {
    var row = data[k];
    var col0 = String(row[0] || "").trim();

    // Detect metadata footer rows
    if (/^created by/i.test(col0)) {
      metaSection = true;
      var meta = parseMeta(String(row[1] || ""));
      createdBy = meta.name; createdDate = meta.date;
      continue;
    }
    if (/^updated by/i.test(col0)) {
      var meta = parseMeta(String(row[1] || ""));
      updatedBy = meta.name; updatedDate = meta.date;
      continue;
    }
    if (/^review by/i.test(col0)) {
      var meta = parseMeta(String(row[1] || ""));
      reviewBy = meta.name; reviewDate = meta.date;
      continue;
    }

    // Skip blank rows and metadata section
    if (metaSection || col0 === "") continue;

    var hazard = getCell(row, colMap.hazard);
    if (!hazard) continue; // skip empty data rows

    var l = clampScore(getCell(row, colMap.l));
    var s = clampScore(getCell(row, colMap.s));
    var lwc = clampScore(getCell(row, colMap.lwc));
    var swc = clampScore(getCell(row, colMap.swc));

    rows.push({
      id: Utilities.getUuid(),
      hazard: hazard,
      who: getCell(row, colMap.who),
      likelihood: l,
      severity: s,
      rationale: getCell(row, colMap.rationale),
      controls: getCell(row, colMap.controls),
      likelihoodWithControls: lwc,
      severityWithControls: swc,
    });
  }

  if (rows.length === 0) {
    Logger.log("WARN: No hazard rows found in sheet '" + name + "'. Skipping.");
    return null;
  }

  return {
    toolName: toolName,
    content: {
      inductionRequired: inductionRequired,
      inductionDetails: inductionDetails,
      ppeRequired: ppeRequired,
      beforeStarting: beforeStarting,
      rows: rows,
      createdBy: createdBy,
      createdDate: createdDate,
      updatedBy: updatedBy,
      updatedDate: updatedDate,
      reviewBy: reviewBy,
      reviewDate: reviewDate,
    },
  };
}

// ── Helpers ───────────────────────────────────────────────────────────

function findCol(headers, candidates) {
  for (var i = 0; i < candidates.length; i++) {
    var idx = headers.indexOf(candidates[i]);
    if (idx !== -1) return idx;
  }
  return -1;
}

function getCell(row, colIndex) {
  if (colIndex === -1) return "";
  return String(row[colIndex] || "").trim();
}

function clampScore(val) {
  var n = parseInt(val, 10);
  if (isNaN(n)) return 3;
  return Math.max(1, Math.min(5, n));
}

function parseMeta(text) {
  // Tries to split "Name, Month Year" or "Name - Date" into name + date parts
  var parts = text.split(/,\s*|\s*[-–]\s*/);
  if (parts.length >= 2) {
    return { name: parts[0].trim(), date: parts.slice(1).join(", ").trim() };
  }
  return { name: text.trim(), date: "" };
}
