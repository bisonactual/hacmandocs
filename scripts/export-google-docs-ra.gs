/**
 * ============================================================================
 * Google Docs Risk Assessment Exporter — Google Apps Script
 * ============================================================================
 *
 * PURPOSE:
 *   Exports risk assessments from Google Docs into the JSON format expected
 *   by the hacmandocs Risk Assessment import endpoint:
 *     POST /api/risk-assessments/import
 *
 * EXPECTED DOC STRUCTURE:
 *   Each doc (or each section separated by a heading) contains:
 *
 *   - Paragraphs containing labels like:
 *       "Induction Required: Yes - In person..."
 *       "PPE Required: Gloves, Faceshield..."
 *       "Before Starting: Ensure equipment..."
 *
 *   - A table with headers in the first row:
 *       Hazard | Who | L | S | R | Rationale | Controls Required | LwC | SwC | RwC
 *     (R and RwC are computed and ignored on import)
 *
 *   - Paragraphs at the end containing:
 *       "Created by/date: Name, Month Year"
 *       "Updated by/date: Name, Month Year"
 *       "Review by/date: Name, Month Year"
 *
 * USAGE:
 *   1. Open https://script.google.com and create a new project.
 *   2. Paste this file into Code.gs.
 *   3. Set DOC_IDS to the ID(s) from your Google Doc URLs:
 *        docs.google.com/document/d/<ID>/edit
 *   4. Set TOOL_NAMES to match each doc's tool name in hacmandocs (same order).
 *      Leave empty "" to use the document title.
 *   5. Run exportRiskAssessments().
 *   6. Find "ra-export.json" in your Google Drive and POST it to:
 *        POST /api/risk-assessments/import
 *
 * ============================================================================
 */

// ── Configuration ─────────────────────────────────────────────────────

/** Google Doc IDs — the string between /d/ and /edit in the URL. */
var DOC_IDS = [
  "1YzYzXI9LsbKmFIURw1XboETq7ZwRWvgf"
];

/**
 * Tool names as they appear in hacmandocs (must match exactly).
 * Use "" to fall back to the document title.
 * Must be the same length and order as DOC_IDS.
 */
var TOOL_NAMES = [
  "Angle Grinder"
];

// ── Main entry point ──────────────────────────────────────────────────

function exportRiskAssessments() {
  if (DOC_IDS.length === 0) {
    Logger.log("ERROR: No doc IDs configured.");
    return;
  }

  var results = [];
  var errors = [];

  for (var i = 0; i < DOC_IDS.length; i++) {
    var toolName = (TOOL_NAMES[i] && TOOL_NAMES[i].trim()) ? TOOL_NAMES[i].trim() : "";
    try {
      var ra = exportDoc(DOC_IDS[i], toolName);
      if (ra) results.push(ra);
    } catch (e) {
      errors.push({ docId: DOC_IDS[i], error: e.message });
      Logger.log("ERROR in doc " + DOC_IDS[i] + ": " + e.message);
    }
  }

  var output = results.length === 1 ? results[0] : { riskAssessments: results };
  var json = JSON.stringify(output, null, 2);

  DriveApp.createFile("ra-export.json", json, "application/json");
  Logger.log("Saved ra-export.json (" + results.length + " RA(s), " + errors.length + " error(s))");
  if (errors.length > 0) Logger.log("Errors: " + JSON.stringify(errors));

  return json;
}

// ── Single doc export ─────────────────────────────────────────────────

function exportDoc(docId, toolNameOverride) {
  var doc = DocumentApp.openById(docId);
  var body = doc.getBody();
  var toolName = toolNameOverride || doc.getName();

  var inductionRequired = false;
  var inductionDetails = "";
  var ppeRequired = "";
  var beforeStarting = "";
  var createdBy = "", createdDate = "";
  var updatedBy = "", updatedDate = "";
  var reviewBy = "", reviewDate = "";

  var rows = [];
  var colMap = null;

  var numChildren = body.getNumChildren();

  for (var i = 0; i < numChildren; i++) {
    var child = body.getChild(i);
    var type = child.getType();

    // ── Parse metadata from paragraphs ───────────────────────────
    if (type === DocumentApp.ElementType.PARAGRAPH ||
        type === DocumentApp.ElementType.LIST_ITEM) {
      var text = child.asText ? child.asText().getText().trim() : child.getText().trim();
      if (!text) continue;

      var lower = text.toLowerCase();

      if (lower.indexOf("induction required:") !== -1 || lower.indexOf("induction required") === 0) {
        var val = extractAfterColon(text);
        inductionRequired = /yes|true|required/i.test(val);
        // Everything after Yes/No is the detail
        var detailMatch = val.replace(/^(yes|no|true|false)[^a-z]*/i, "").trim();
        if (detailMatch) inductionDetails = detailMatch;
      } else if (lower.indexOf("ppe required:") !== -1 || lower.indexOf("ppe:") !== -1) {
        ppeRequired = extractAfterColon(text);
      } else if (lower.indexOf("before starting:") !== -1) {
        beforeStarting = extractAfterColon(text);
      } else if (/^created by/i.test(text)) {
        var meta = parseMeta(extractAfterColon(text));
        createdBy = meta.name; createdDate = meta.date;
      } else if (/^updated by/i.test(text)) {
        var meta = parseMeta(extractAfterColon(text));
        updatedBy = meta.name; updatedDate = meta.date;
      } else if (/^review by/i.test(text)) {
        var meta = parseMeta(extractAfterColon(text));
        reviewBy = meta.name; reviewDate = meta.date;
      }
      continue;
    }

    // ── Parse the risk assessment table ──────────────────────────
    if (type === DocumentApp.ElementType.TABLE) {
      var table = child.asTable();
      var numRows = table.getNumRows();
      if (numRows < 2) continue;

      // Read header row to build column map
      var headerRow = table.getRow(0);
      var headers = [];
      for (var c = 0; c < headerRow.getNumCells(); c++) {
        headers.push(headerRow.getCell(c).getText().trim().toLowerCase());
      }

      // Only process tables that look like risk assessment tables
      if (headers.indexOf("hazard") === -1) continue;

      colMap = {
        hazard:    findCol(headers, ["hazard"]),
        who:       findCol(headers, ["who", "who might be harmed"]),
        l:         findCol(headers, ["l", "likelihood"]),
        s:         findCol(headers, ["s", "severity"]),
        rationale: findCol(headers, ["rationale", "reason"]),
        controls:  findCol(headers, ["controls required", "controls", "control measures"]),
        lwc:       findCol(headers, ["lwc", "likelihood with controls"]),
        swc:       findCol(headers, ["swc", "severity with controls"]),
      };

      // Parse data rows
      for (var r = 1; r < numRows; r++) {
        var row = table.getRow(r);
        var hazard = getCellText(row, colMap.hazard);
        if (!hazard) continue;

        rows.push({
          id: Utilities.getUuid(),
          hazard: hazard,
          who: getCellText(row, colMap.who),
          likelihood: clampScore(getCellText(row, colMap.l)),
          severity: clampScore(getCellText(row, colMap.s)),
          rationale: getCellText(row, colMap.rationale),
          controls: getCellText(row, colMap.controls),
          likelihoodWithControls: clampScore(getCellText(row, colMap.lwc)),
          severityWithControls: clampScore(getCellText(row, colMap.swc)),
        });
      }
    }
  }

  if (rows.length === 0) {
    Logger.log("WARN: No hazard rows found in doc '" + toolName + "'. Check the table has a 'Hazard' header row.");
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

function getCellText(row, colIndex) {
  if (colIndex === -1 || colIndex >= row.getNumCells()) return "";
  return row.getCell(colIndex).getText().trim();
}

function clampScore(val) {
  var n = parseInt(val, 10);
  if (isNaN(n)) return 3;
  return Math.max(1, Math.min(5, n));
}

function extractAfterColon(text) {
  var idx = text.indexOf(":");
  return idx !== -1 ? text.substring(idx + 1).trim() : text.trim();
}

function parseMeta(text) {
  var parts = text.split(/,\s*|\s*[-–]\s*/);
  if (parts.length >= 2) {
    return { name: parts[0].trim(), date: parts.slice(1).join(", ").trim() };
  }
  return { name: text.trim(), date: "" };
}
