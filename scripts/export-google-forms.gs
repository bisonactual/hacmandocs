/**
 * ============================================================================
 * Google Forms Quiz Exporter — Google Apps Script
 * ============================================================================
 *
 * PURPOSE:
 *   Exports one or more Google Forms quizzes into a JSON format compatible
 *   with the hacmandocs Tool Induction System import endpoint:
 *     POST /api/inductions/quizzes/import
 *
 * USAGE:
 *   1. Open https://script.google.com and create a new project.
 *   2. Paste this entire file into the Code.gs editor.
 *   3. Update the FORM_IDS array below with the IDs of the Google Forms
 *      you want to export. The form ID is the long string in the URL:
 *        https://docs.google.com/forms/d/<FORM_ID>/edit
 *   4. Run the `exportForms` function from the Apps Script editor.
 *   5. Check the Logs (View → Logs) for the JSON output.
 *   6. Copy the JSON and POST it to the import endpoint, or save it as
 *      a .json file for later use.
 *
 * SINGLE FORM:
 *   Set FORM_IDS to a single-element array. The output will be a single
 *   quiz object: { title, description, questions: [...] }
 *
 * BATCH EXPORT:
 *   Set FORM_IDS to multiple form IDs. The output will be a batch object:
 *   { quizzes: [{ title, description, questions: [...] }, ...] }
 *
 * NOTES:
 *   - Only multiple-choice and true/false (checkbox with 2 options) question
 *     types are supported. Other item types (grids, scales, etc.) are skipped.
 *   - The script reads correct answers from the quiz settings. Make sure
 *     "Make this a quiz" is enabled in the form settings and correct answers
 *     are set for each question.
 *   - Section headers and descriptions are concatenated into the quiz
 *     description field.
 *
 * ============================================================================
 */

// ── Configuration ────────────────────────────────────────────────────

/** Replace with your Google Form ID(s). */
var FORM_IDS = [
   "1GeeKFs9aKun-GhsxShq0kc7Hy1uR4m1wY5Qyki7ekl4"
];

// ── Main entry point ─────────────────────────────────────────────────

function exportForms() {
  if (FORM_IDS.length === 0) {
    Logger.log("ERROR: No form IDs configured. Edit the FORM_IDS array.");
    return;
  }

  var quizzes = [];

  for (var f = 0; f < FORM_IDS.length; f++) {
    var quiz = exportSingleForm(FORM_IDS[f]);
    if (quiz) {
      quizzes.push(quiz);
    }
  }

  var output;
  if (quizzes.length === 1) {
    output = quizzes[0];
  } else {
    output = { quizzes: quizzes };
  }

  var json = JSON.stringify(output, null, 2);
  DriveApp.createFile("quiz-export.json", json, "application/json");
  Logger.log("Saved quiz-export.json to Google Drive (" + json.length + " bytes, " + quizzes.length + " quiz(es))");
  return json;
}

// ── Single form export ───────────────────────────────────────────────

function exportSingleForm(formId) {
  var form;
  try {
    form = FormApp.openById(formId);
  } catch (e) {
    Logger.log("ERROR: Could not open form " + formId + ": " + e.message);
    return null;
  }

  var title = form.getTitle();
  var descriptionParts = [];

  // Include the form description if present
  var formDesc = form.getDescription();
  if (formDesc && formDesc.trim()) {
    descriptionParts.push(formDesc.trim());
  }

  var items = form.getItems();
  var questions = [];

  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var itemType = item.getType();

    // Collect section headers and their descriptions into the quiz description
    if (itemType === FormApp.ItemType.SECTION_HEADER) {
      var section = item.asSectionHeaderItem();
      var sectionTitle = section.getTitle();
      var sectionHelp = section.getHelpText();
      if (sectionTitle && sectionTitle.trim()) {
        descriptionParts.push("## " + sectionTitle.trim());
      }
      if (sectionHelp && sectionHelp.trim()) {
        descriptionParts.push(sectionHelp.trim());
      }
      continue;
    }

    // Collect page break descriptions (multi-page forms)
    if (itemType === FormApp.ItemType.PAGE_BREAK) {
      var pageBreak = item.asPageBreakItem();
      var pageTitle = pageBreak.getTitle();
      var pageHelp = pageBreak.getHelpText();
      if (pageTitle && pageTitle.trim()) {
        descriptionParts.push("## " + pageTitle.trim());
      }
      if (pageHelp && pageHelp.trim()) {
        descriptionParts.push(pageHelp.trim());
      }
      continue;
    }

    // Process multiple-choice questions
    if (itemType === FormApp.ItemType.MULTIPLE_CHOICE) {
      var mcItem = item.asMultipleChoiceItem();
      var question = extractMultipleChoice(mcItem);
      if (question) {
        questions.push(question);
      }
      continue;
    }

    // Process checkbox questions
    if (itemType === FormApp.ItemType.CHECKBOX) {
      var cbItem = item.asCheckboxItem();
      var choices = cbItem.getChoices();
      if (choices.length === 2) {
        // 2 options → true/false
        var tfQuestion = extractTrueFalse(cbItem, choices);
        if (tfQuestion) {
          questions.push(tfQuestion);
        }
      } else if (choices.length >= 3) {
        // 3+ options → multi_select (select all that apply)
        var msQuestion = extractMultiSelect(cbItem, choices);
        if (msQuestion) {
          questions.push(msQuestion);
        }
      }
      continue;
    }

    // Capture video items — Google Forms stores video title/description but
    // does NOT expose the video URL through the FormApp API.
    // The URL must be in the help text or title if the form creator added it.
    if (itemType === FormApp.ItemType.VIDEO) {
      var videoItem = item.asVideoItem();
      var videoTitle = videoItem.getTitle();
      var videoHelp = videoItem.getHelpText();
      if (videoTitle && videoTitle.trim()) {
        descriptionParts.push("**" + videoTitle.trim() + "**");
      }
      if (videoHelp && videoHelp.trim()) {
        descriptionParts.push(videoHelp.trim());
      }
      // Note: If you need the YouTube URL, add it to the video's help text
      // in Google Forms, or manually add it to the quiz description after import.
      continue;
    }

    // Capture image items
    if (itemType === FormApp.ItemType.IMAGE) {
      var imageItem = item.asImageItem();
      var imageTitle = imageItem.getTitle();
      var imageHelp = imageItem.getHelpText();
      if (imageTitle && imageTitle.trim()) {
        descriptionParts.push("**" + imageTitle.trim() + "**");
      }
      if (imageHelp && imageHelp.trim()) {
        descriptionParts.push(imageHelp.trim());
      }
      continue;
    }

    // Skip other unsupported item types (text, grid, scale, etc.)
  }

  var description = descriptionParts.length > 0
    ? descriptionParts.join("\n\n")
    : undefined;

  return {
    title: title,
    description: description,
    questions: questions
  };
}

// ── Question extractors ──────────────────────────────────────────────

function extractMultipleChoice(mcItem) {
  var questionText = mcItem.getTitle();
  var choices = mcItem.getChoices();

  if (choices.length < 2) {
    Logger.log("WARN: Skipping question with fewer than 2 choices: " + questionText);
    return null;
  }

  var options = [];
  var correctIndex = -1;

  for (var i = 0; i < choices.length; i++) {
    options.push(choices[i].getValue());
    if (choices[i].isCorrectAnswer()) {
      correctIndex = i;
    }
  }

  if (correctIndex === -1) {
    Logger.log("WARN: No correct answer set for question: " + questionText);
    correctIndex = 0; // Default to first option
  }

  return {
    questionText: questionText,
    questionType: "multiple_choice",
    options: options,
    correctOptionIndex: correctIndex
  };
}

function extractTrueFalse(cbItem, choices) {
  var questionText = cbItem.getTitle();
  var options = [];
  var correctIndex = -1;

  for (var i = 0; i < choices.length; i++) {
    options.push(choices[i].getValue());
    if (choices[i].isCorrectAnswer()) {
      correctIndex = i;
    }
  }

  if (correctIndex === -1) {
    Logger.log("WARN: No correct answer set for true/false question: " + questionText);
    correctIndex = 0;
  }

  return {
    questionText: questionText,
    questionType: "true_false",
    options: options,
    correctOptionIndex: correctIndex
  };
}

function extractMultiSelect(cbItem, choices) {
  var questionText = cbItem.getTitle();
  var options = [];
  var correctIndices = [];

  for (var i = 0; i < choices.length; i++) {
    options.push(choices[i].getValue());
    if (choices[i].isCorrectAnswer()) {
      correctIndices.push(i);
    }
  }

  if (correctIndices.length === 0) {
    Logger.log("WARN: No correct answers set for multi-select question: " + questionText);
    correctIndices = [0];
  }

  return {
    questionText: questionText,
    questionType: "multi_select",
    options: options,
    correctOptionIndex: correctIndices[0],
    correctOptionIndices: correctIndices
  };
}
