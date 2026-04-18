import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../../lib/api";
import ImageInsertButton from "../../components/ImageInsertButton";
import { useImagePaste } from "../../hooks/useImagePaste";

interface QuestionRow {
  id: string;
  questionText: string;
  questionType: string;
  options: string[];
  correctOptionIndex: number;
  correctOptionIndicesJson?: string | null;
  sortOrder: number;
}

interface QuizRow {
  id: string;
  title: string;
  description: string | null;
  showWrongAnswers: number | boolean;
  status: string;
  questionCount?: number;
}

const statusColors: Record<string, string> = {
  draft: "bg-hacman-gray text-gray-400",
  published: "bg-green-500/20 text-green-400 border border-green-500/30",
  archived: "bg-amber-500/20 text-amber-400 border border-amber-500/30",
};

export default function QuizzesPage() {
  const navigate = useNavigate();
  const [quizzes, setQuizzes] = useState<QuizRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newShowWrong, setNewShowWrong] = useState(true);
  const [editingQuiz, setEditingQuiz] = useState<QuizRow | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editShowWrong, setEditShowWrong] = useState(true);
  // Question editor state
  const [selectedQuizId, setSelectedQuizId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [selectedQuizStatus, setSelectedQuizStatus] = useState("");
  const [qForm, setQForm] = useState({
    questionText: "",
    questionType: "multiple_choice",
    options: ["", ""],
    correctOptionIndex: 0,
    correctOptionIndices: [] as number[],
  });
  const [editingQuestion, setEditingQuestion] = useState<QuestionRow | null>(null);
  const [eqForm, setEqForm] = useState({
    questionText: "",
    questionType: "multiple_choice",
    options: ["", ""],
    correctOptionIndex: 0,
    correctOptionIndices: [] as number[],
  });
  const [importJson, setImportJson] = useState("");
  const [showImport, setShowImport] = useState(false);

  // Paste handlers for image upload on question text fields
  const onPasteNewQ = useImagePaste(useCallback((md: string) => setQForm((prev) => ({ ...prev, questionText: prev.questionText + " " + md })), []));
  const onPasteEditQ = useImagePaste(useCallback((md: string) => setEqForm((prev) => ({ ...prev, questionText: prev.questionText + " " + md })), []));

  const loadQuizzes = () => {
    setLoading(true);
    apiFetch<QuizRow[]>("/api/inductions/quizzes")
      .then(setQuizzes)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(loadQuizzes, []);

  const loadQuestions = async (quizId: string) => {
    const quiz = quizzes.find((q) => q.id === quizId);
    setSelectedQuizId(quizId);
    setSelectedQuizStatus(quiz?.status ?? "");
    setEditingQuestion(null);
    try {
      const data = await apiFetch<{ questions: QuestionRow[] }>(`/api/inductions/quizzes/${quizId}`);
      const qs = (data.questions ?? []).map((q) => ({
        ...q,
        options: typeof q.options === "string" ? JSON.parse(q.options) : q.options,
      }));
      setQuestions(qs);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load questions");
    }
  };

  const createQuiz = async () => {
    if (!newTitle.trim()) return;
    setError("");
    try {
      const result = await apiFetch<{ id: string }>("/api/inductions/quizzes", {
        method: "POST",
        body: JSON.stringify({ title: newTitle, description: null, showWrongAnswers: newShowWrong }),
      });
      setNewTitle("");
      setNewShowWrong(true);
      loadQuizzes();
      // Navigate to the description editor for the newly created quiz
      navigate(`/admin/quizzes/${result.id}/description`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Create failed");
    }
  };

  const updateQuiz = async () => {
    if (!editingQuiz) return;
    setError("");
    try {
      await apiFetch(`/api/inductions/quizzes/${editingQuiz.id}`, {
        method: "PUT",
        body: JSON.stringify({ title: editTitle, showWrongAnswers: editShowWrong }),
      });
      setEditingQuiz(null);
      loadQuizzes();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Update failed");
    }
  };

  const publishQuiz = async (id: string) => {
    setError("");
    try {
      await apiFetch(`/api/inductions/quizzes/${id}/publish`, { method: "POST" });
      loadQuizzes();
      if (selectedQuizId === id) setSelectedQuizStatus("published");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Publish failed");
    }
  };

  const archiveQuiz = async (id: string) => {
    setError("");
    try {
      await apiFetch(`/api/inductions/quizzes/${id}/archive`, { method: "POST" });
      loadQuizzes();
      if (selectedQuizId === id) setSelectedQuizStatus("archived");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Archive failed");
    }
  };

  const addQuestion = async () => {
    if (!selectedQuizId || !qForm.questionText.trim()) return;
    setError("");
    try {
      const payload: Record<string, unknown> = {
        questionText: qForm.questionText,
        questionType: qForm.questionType,
        options: qForm.options.filter((o) => o.trim()),
      };
      if (qForm.questionType === "multi_select") {
        payload.correctOptionIndices = qForm.correctOptionIndices;
      } else {
        payload.correctOptionIndex = qForm.correctOptionIndex;
      }
      await apiFetch(`/api/inductions/quizzes/${selectedQuizId}/questions`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setQForm({ questionText: "", questionType: "multiple_choice", options: ["", ""], correctOptionIndex: 0, correctOptionIndices: [] });
      loadQuestions(selectedQuizId);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Add question failed");
    }
  };

  const updateQuestion = async () => {
    if (!selectedQuizId || !editingQuestion) return;
    setError("");
    try {
      const payload: Record<string, unknown> = {
        questionText: eqForm.questionText,
        questionType: eqForm.questionType,
        options: eqForm.options.filter((o) => o.trim()),
      };
      if (eqForm.questionType === "multi_select") {
        payload.correctOptionIndices = eqForm.correctOptionIndices;
      } else {
        payload.correctOptionIndex = eqForm.correctOptionIndex;
      }
      await apiFetch(`/api/inductions/quizzes/${selectedQuizId}/questions/${editingQuestion.id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      setEditingQuestion(null);
      loadQuestions(selectedQuizId);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Update question failed");
    }
  };

  const startEditQuestion = (q: QuestionRow) => {
    const correctIndices = q.correctOptionIndicesJson
      ? JSON.parse(q.correctOptionIndicesJson) as number[]
      : [];
    setEditingQuestion(q);
    setEqForm({
      questionText: q.questionText,
      questionType: q.questionType,
      options: [...q.options],
      correctOptionIndex: q.correctOptionIndex,
      correctOptionIndices: correctIndices,
    });
  };

  const deleteQuestion = async (questionId: string) => {
    if (!selectedQuizId) return;
    try {
      await apiFetch(`/api/inductions/quizzes/${selectedQuizId}/questions/${questionId}`, { method: "DELETE" });
      loadQuestions(selectedQuizId);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const handleImport = async () => {
    setError("");
    try {
      const parsed = JSON.parse(importJson);
      await apiFetch("/api/inductions/quizzes/import", { method: "POST", body: JSON.stringify(parsed) });
      setImportJson("");
      setShowImport(false);
      loadQuizzes();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Import failed");
    }
  };

  const isPublished = selectedQuizStatus === "published";

  const getCorrectIndices = (q: QuestionRow): number[] => {
    if (q.correctOptionIndicesJson) {
      try { return JSON.parse(q.correctOptionIndicesJson) as number[]; } catch { /* ignore */ }
    }
    return [q.correctOptionIndex];
  };

  if (loading) return <p className="text-hacman-muted">Loading quizzes & information…</p>;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-hacman-gray bg-hacman-dark px-4 py-3">
        <p className="text-sm text-gray-400">Create and manage quizzes and information pages. Entries can be used as online inductions, pre-induction assessments, refresher courses, or standalone information pages (description only, no questions). Attach an entry to a tool on the Tools page — tick "No induction needed" if it's info-only.</p>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {/* Create quiz */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-hacman-gray p-4">
        <div>
          <label className="block text-xs text-hacman-muted">Title</label>
          <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} className="rounded-lg border border-hacman-gray bg-hacman-black px-2 py-1 text-sm text-gray-200 placeholder-hacman-muted focus:border-hacman-yellow focus:ring-hacman-yellow" />
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-400">
          <input type="checkbox" checked={newShowWrong} onChange={(e) => setNewShowWrong(e.target.checked)} className="accent-hacman-yellow" />
          Show wrong answers on fail
        </label>
        <button onClick={createQuiz} className="rounded-lg bg-hacman-yellow px-4 py-1.5 text-sm font-semibold text-hacman-black hover:bg-hacman-yellow-dark">Create Quiz</button>
        <button onClick={() => setShowImport(!showImport)} className="rounded-lg bg-hacman-gray px-4 py-1.5 text-sm text-hacman-text hover:bg-hacman-gray/80">Import JSON</button>
        <p className="w-full text-xs text-hacman-muted">After creating, you'll be taken to the rich text description editor.</p>
      </div>

      {showImport && (
        <div className="rounded-lg border border-hacman-gray p-4 space-y-2">
          <textarea
            value={importJson}
            onChange={(e) => setImportJson(e.target.value)}
            rows={6}
            placeholder='{"title":"...","questions":[...]}'
            className="w-full rounded-lg border border-hacman-gray bg-hacman-black px-2 py-1 text-sm font-mono text-gray-200 placeholder-hacman-muted focus:border-hacman-yellow focus:ring-hacman-yellow"
          />
          <button onClick={handleImport} className="rounded-lg bg-green-600 px-4 py-1.5 text-sm text-white hover:bg-green-700">Import</button>
        </div>
      )}

      {/* Edit quiz modal */}
      {editingQuiz && (
        <div className="rounded-lg border border-hacman-yellow/30 bg-hacman-yellow/10 p-4 space-y-2">
          <p className="text-sm font-medium text-gray-200">Edit Quiz</p>
          <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="w-full rounded-lg border border-hacman-gray bg-hacman-black px-2 py-1 text-sm text-gray-200 placeholder-hacman-muted focus:border-hacman-yellow focus:ring-hacman-yellow" />
          <button
            onClick={() => navigate(`/admin/quizzes/${editingQuiz.id}/description`)}
            className="rounded-lg bg-hacman-gray px-3 py-1 text-sm text-hacman-yellow hover:bg-hacman-gray/80"
          >
            ✏️ Edit Description
          </button>
          <label className="flex items-center gap-2 text-sm text-gray-400">
            <input type="checkbox" checked={editShowWrong} onChange={(e) => setEditShowWrong(e.target.checked)} className="accent-hacman-yellow" />
            Show wrong answers on fail
          </label>
          <div className="flex gap-2">
            <button onClick={updateQuiz} className="rounded-lg bg-hacman-yellow px-3 py-1 text-sm font-semibold text-hacman-black hover:bg-hacman-yellow-dark">Save</button>
            <button onClick={() => setEditingQuiz(null)} className="text-sm text-gray-400 hover:text-hacman-yellow">Cancel</button>
          </div>
        </div>
      )}

      {/* Quiz list */}
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-hacman-gray text-hacman-muted">
            <th className="py-2 pr-4">Title</th>
            <th className="py-2 pr-4">Type</th>
            <th className="py-2 pr-4">Status</th>
            <th className="py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {quizzes.map((q) => (
            <tr key={q.id} className="border-b border-hacman-gray/50">
              <td className="py-2 pr-4">
                <button onClick={() => loadQuestions(q.id)} className="text-hacman-yellow hover:underline">{q.title}</button>
              </td>
              <td className="py-2 pr-4">
                <span className={`rounded px-2 py-0.5 text-xs ${(q.questionCount ?? 0) > 0 ? "bg-blue-500/20 text-blue-400" : "bg-purple-500/20 text-purple-400"}`}>
                  {(q.questionCount ?? 0) > 0 ? `Quiz (${q.questionCount})` : "Info only"}
                </span>
              </td>
              <td className="py-2 pr-4">
                <span className={`rounded px-2 py-0.5 text-xs ${statusColors[q.status] ?? ""}`}>{q.status}</span>
              </td>
              <td className="flex gap-2 py-2">
                <button onClick={() => navigate(`/admin/quizzes/${q.id}/description`)} className="text-xs text-blue-400 hover:underline">Description</button>
                <button onClick={() => { setEditingQuiz(q); setEditTitle(q.title); setEditShowWrong(!!q.showWrongAnswers); }} className="text-xs text-hacman-yellow hover:underline">Edit</button>
                {q.status === "draft" && <button onClick={() => publishQuiz(q.id)} className="text-xs text-green-400 hover:underline">Publish</button>}
                {q.status === "published" && <button onClick={() => archiveQuiz(q.id)} className="text-xs text-amber-400 hover:underline">Archive</button>}
              </td>
            </tr>
          ))}
          {quizzes.length === 0 && (
            <tr><td colSpan={4} className="py-4 text-center text-hacman-muted">No quizzes or information pages yet.</td></tr>
          )}
        </tbody>
      </table>

      {/* Question editor */}
      {selectedQuizId && (
        <div className="rounded-lg border border-hacman-gray p-4 space-y-4">
          <h3 className="font-medium text-gray-200">Questions for selected quiz</h3>

          {questions.map((q, i) => (
            <div key={q.id} className="flex items-start justify-between rounded-lg border border-hacman-gray/50 p-3">
              <div>
                <p className="text-sm font-medium text-gray-200">{i + 1}. {q.questionText}</p>
                <p className="text-xs text-hacman-muted mt-0.5">{q.questionType === "multi_select" ? "Multi Select" : q.questionType === "true_false" ? "True/False" : "Multiple Choice"}</p>
                <ul className="mt-1 space-y-0.5">
                  {q.options.map((opt, oi) => {
                    const isCorrect = q.questionType === "multi_select"
                      ? getCorrectIndices(q).includes(oi)
                      : oi === q.correctOptionIndex;
                    return (
                      <li key={oi} className={`text-xs ${isCorrect ? "font-bold text-green-400" : "text-gray-400"}`}>
                        {isCorrect ? "✓ " : "  "}{opt}
                      </li>
                    );
                  })}
                </ul>
              </div>
              {!isPublished && (
                <div className="flex gap-2">
                  <button onClick={() => startEditQuestion(q)} className="text-xs text-hacman-yellow hover:underline">Edit</button>
                  <button onClick={() => deleteQuestion(q.id)} className="text-xs text-red-400 hover:underline">Delete</button>
                </div>
              )}
            </div>
          ))}

          {/* Edit question form */}
          {editingQuestion && !isPublished && (
            <div className="space-y-2 rounded-lg border border-hacman-yellow/30 bg-hacman-yellow/10 p-3">
              <p className="text-xs font-medium text-hacman-yellow">Edit Question</p>
              <div className="flex items-center gap-2">
                <input
                  value={eqForm.questionText}
                  onChange={(e) => setEqForm({ ...eqForm, questionText: e.target.value })}
                  onPaste={onPasteEditQ}
                  placeholder="Question text (supports markdown image syntax)"
                  className="flex-1 rounded-lg border border-hacman-gray bg-hacman-black px-2 py-1 text-sm text-gray-200 placeholder-hacman-muted focus:border-hacman-yellow focus:ring-hacman-yellow"
                />
                <ImageInsertButton onInsert={(md) => setEqForm((prev) => ({ ...prev, questionText: prev.questionText + " " + md }))} />
              </div>
              <select
                value={eqForm.questionType}
                onChange={(e) => {
                  const type = e.target.value;
                  setEqForm({
                    ...eqForm,
                    questionType: type,
                    options: type === "true_false" ? ["True", "False"] : eqForm.options,
                    correctOptionIndex: 0,
                    correctOptionIndices: [],
                  });
                }}
                className="rounded-lg border border-hacman-gray bg-hacman-black px-2 py-1 text-sm text-gray-200 focus:border-hacman-yellow focus:ring-hacman-yellow"
              >
                <option value="multiple_choice">Multiple Choice</option>
                <option value="true_false">True/False</option>
                <option value="multi_select">Multi Select (select all that apply)</option>
              </select>
              {eqForm.questionType === "multiple_choice" && (
                <div className="space-y-1">
                  {eqForm.options.map((opt, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input type="radio" name="eq-correct" checked={eqForm.correctOptionIndex === i} onChange={() => setEqForm({ ...eqForm, correctOptionIndex: i })} />
                      <input value={opt} onChange={(e) => { const opts = [...eqForm.options]; opts[i] = e.target.value; setEqForm({ ...eqForm, options: opts }); }} placeholder={`Option ${i + 1}`} className="flex-1 rounded-lg border border-hacman-gray bg-hacman-black px-2 py-1 text-sm text-gray-200 placeholder-hacman-muted focus:border-hacman-yellow focus:ring-hacman-yellow" />
                    </div>
                  ))}
                  <button type="button" onClick={() => setEqForm({ ...eqForm, options: [...eqForm.options, ""] })} className="text-xs text-hacman-yellow hover:underline">+ Add option</button>
                </div>
              )}
              {eqForm.questionType === "multi_select" && (
                <div className="space-y-1">
                  {eqForm.options.map((opt, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input type="checkbox" checked={eqForm.correctOptionIndices.includes(i)} onChange={(e) => { const indices = e.target.checked ? [...eqForm.correctOptionIndices, i] : eqForm.correctOptionIndices.filter((x) => x !== i); setEqForm({ ...eqForm, correctOptionIndices: indices }); }} />
                      <input value={opt} onChange={(e) => { const opts = [...eqForm.options]; opts[i] = e.target.value; setEqForm({ ...eqForm, options: opts }); }} placeholder={`Option ${i + 1}`} className="flex-1 rounded-lg border border-hacman-gray bg-hacman-black px-2 py-1 text-sm text-gray-200 placeholder-hacman-muted focus:border-hacman-yellow focus:ring-hacman-yellow" />
                    </div>
                  ))}
                  <button type="button" onClick={() => setEqForm({ ...eqForm, options: [...eqForm.options, ""] })} className="text-xs text-hacman-yellow hover:underline">+ Add option</button>
                </div>
              )}
              {eqForm.questionType === "true_false" && (
                <div className="flex gap-4">
                  <label className="flex items-center gap-1 text-sm text-gray-200"><input type="radio" name="eq-tf-correct" checked={eqForm.correctOptionIndex === 0} onChange={() => setEqForm({ ...eqForm, correctOptionIndex: 0 })} /> True</label>
                  <label className="flex items-center gap-1 text-sm text-gray-200"><input type="radio" name="eq-tf-correct" checked={eqForm.correctOptionIndex === 1} onChange={() => setEqForm({ ...eqForm, correctOptionIndex: 1 })} /> False</label>
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={updateQuestion} className="rounded-lg bg-hacman-yellow px-3 py-1 text-sm font-semibold text-hacman-black hover:bg-hacman-yellow-dark">Save</button>
                <button onClick={() => setEditingQuestion(null)} className="text-sm text-gray-400 hover:text-hacman-yellow">Cancel</button>
              </div>
            </div>
          )}

          {/* Add question form */}
          <div className="space-y-2 rounded-lg border border-dashed border-hacman-gray p-3">
            <p className="text-xs font-medium text-hacman-muted">Add Question</p>
            <div className="flex items-center gap-2">
              <input
                value={qForm.questionText}
                onChange={(e) => setQForm({ ...qForm, questionText: e.target.value })}
                onPaste={onPasteNewQ}
                placeholder="Question text (supports markdown image syntax)"
                className="flex-1 rounded-lg border border-hacman-gray bg-hacman-black px-2 py-1 text-sm text-gray-200 placeholder-hacman-muted focus:border-hacman-yellow focus:ring-hacman-yellow"
              />
              <ImageInsertButton onInsert={(md) => setQForm((prev) => ({ ...prev, questionText: prev.questionText + " " + md }))} />
            </div>
            <select
              value={qForm.questionType}
              onChange={(e) => {
                const type = e.target.value;
                setQForm({
                  ...qForm,
                  questionType: type,
                  options: type === "true_false" ? ["True", "False"] : ["", ""],
                  correctOptionIndex: 0,
                  correctOptionIndices: [],
                });
              }}
              className="rounded-lg border border-hacman-gray bg-hacman-black px-2 py-1 text-sm text-gray-200 focus:border-hacman-yellow focus:ring-hacman-yellow"
            >
              <option value="multiple_choice">Multiple Choice</option>
              <option value="true_false">True/False</option>
              <option value="multi_select">Multi Select (select all that apply)</option>
            </select>
            {qForm.questionType === "multiple_choice" && (
              <div className="space-y-1">
                {qForm.options.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input type="radio" name="correct" checked={qForm.correctOptionIndex === i} onChange={() => setQForm({ ...qForm, correctOptionIndex: i })} />
                    <input value={opt} onChange={(e) => { const opts = [...qForm.options]; opts[i] = e.target.value; setQForm({ ...qForm, options: opts }); }} placeholder={`Option ${i + 1}`} className="flex-1 rounded-lg border border-hacman-gray bg-hacman-black px-2 py-1 text-sm text-gray-200 placeholder-hacman-muted focus:border-hacman-yellow focus:ring-hacman-yellow" />
                  </div>
                ))}
                <button type="button" onClick={() => setQForm({ ...qForm, options: [...qForm.options, ""] })} className="text-xs text-hacman-yellow hover:underline">+ Add option</button>
              </div>
            )}
            {qForm.questionType === "multi_select" && (
              <div className="space-y-1">
                {qForm.options.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input type="checkbox" checked={qForm.correctOptionIndices.includes(i)} onChange={(e) => { const indices = e.target.checked ? [...qForm.correctOptionIndices, i] : qForm.correctOptionIndices.filter((x) => x !== i); setQForm({ ...qForm, correctOptionIndices: indices }); }} />
                    <input value={opt} onChange={(e) => { const opts = [...qForm.options]; opts[i] = e.target.value; setQForm({ ...qForm, options: opts }); }} placeholder={`Option ${i + 1}`} className="flex-1 rounded-lg border border-hacman-gray bg-hacman-black px-2 py-1 text-sm text-gray-200 placeholder-hacman-muted focus:border-hacman-yellow focus:ring-hacman-yellow" />
                  </div>
                ))}
                <button type="button" onClick={() => setQForm({ ...qForm, options: [...qForm.options, ""] })} className="text-xs text-hacman-yellow hover:underline">+ Add option</button>
              </div>
            )}
            {qForm.questionType === "true_false" && (
              <div className="flex gap-4">
                <label className="flex items-center gap-1 text-sm text-gray-200"><input type="radio" name="tf-correct" checked={qForm.correctOptionIndex === 0} onChange={() => setQForm({ ...qForm, correctOptionIndex: 0 })} /> True</label>
                <label className="flex items-center gap-1 text-sm text-gray-200"><input type="radio" name="tf-correct" checked={qForm.correctOptionIndex === 1} onChange={() => setQForm({ ...qForm, correctOptionIndex: 1 })} /> False</label>
              </div>
            )}
            <button onClick={addQuestion} className="rounded-lg bg-hacman-yellow px-3 py-1 text-sm font-semibold text-hacman-black hover:bg-hacman-yellow-dark">Add Question</button>
          </div>
        </div>
      )}
    </div>
  );
}
