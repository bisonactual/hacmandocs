import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { apiFetch } from "../../lib/api";

/**
 * Lightweight Markdown-to-HTML for quiz descriptions from Google Forms.
 *
 * Google Forms exports descriptions with:
 * - ## headings for sections
 * - **bold** lines as sub-labels (e.g. "Online part (this part)")
 * - Single \n between lines that should be separate paragraphs
 * - Double \n\n for section breaks
 */
function markdownToHtml(md: string): string {
  let html = md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Split on double newlines first to get paragraph-level blocks,
  // then handle single newlines within each block
  const blocks = html.split(/\n{2,}/);
  const output: string[] = [];

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    // Heading block: ## Text or ## **Text**
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      let text = headingMatch[2];
      text = text.replace(/^\*\*(.+)\*\*$/, "$1");
      output.push(`<h${level}>${inlineMarkdown(text)}</h${level}>`);
      continue;
    }

    // Block may contain multiple single-newline-separated lines.
    // Each line becomes its own element. Bold-only lines become <strong> blocks.
    const lines = trimmed.split("\n");
    for (const line of lines) {
      const lt = line.trim();
      if (!lt) continue;

      // Sub-heading check within block: line that's just ## ...
      const subHeading = lt.match(/^(#{1,6})\s+(.+)$/);
      if (subHeading) {
        const level = subHeading[1].length;
        let text = subHeading[2];
        text = text.replace(/^\*\*(.+)\*\*$/, "$1");
        output.push(`<h${level}>${inlineMarkdown(text)}</h${level}>`);
        continue;
      }

      // Bold-only line → render as a strong label with spacing
      if (/^\*\*[^*]+\*\*$/.test(lt)) {
        const label = lt.replace(/^\*\*(.+)\*\*$/, "$1");
        output.push(`<p><strong>${inlineMarkdown(label)}</strong></p>`);
        continue;
      }

      // Unordered list item
      if (/^[-*]\s+/.test(lt)) {
        const prev = output[output.length - 1];
        if (prev && prev.startsWith("<oli>")) {
          output.push("</ol>");
        }
        if (!prev || !prev.startsWith("<li>")) {
          output.push("<ul>");
        }
        output.push(`<li>${inlineMarkdown(lt.replace(/^[-*]\s+/, ""))}</li>`);
        continue;
      }

      // Ordered list item (e.g. "1. Item text")
      if (/^\d+\.\s+/.test(lt)) {
        const prev = output[output.length - 1];
        if (!prev || !prev.startsWith("<oli>")) {
          // Close any open unordered list first
          if (prev && prev.startsWith("<li>")) {
            output.push("</ul>");
          }
          output.push("<ol>");
        }
        output.push(`<oli>${inlineMarkdown(lt.replace(/^\d+\.\s+/, ""))}</oli>`);
        continue;
      }

      // Close any open list before adding a non-list element
      const prev = output[output.length - 1];
      if (prev && prev.startsWith("<li>")) {
        output.push("</ul>");
      }
      if (prev && prev.startsWith("<oli>")) {
        output.push("</ol>");
      }

      // Regular paragraph
      output.push(`<p>${inlineMarkdown(lt)}</p>`);
    }

    // Close any trailing open list in this block
    const last = output[output.length - 1];
    if (last && last.startsWith("<li>")) {
      output.push("</ul>");
    }
    if (last && last.startsWith("<oli>")) {
      output.push("</ol>");
    }
  }

  return output.join("\n").replace(/<oli>/g, "<li>").replace(/<\/oli>/g, "</li>");
}

/** Convert inline Markdown (bold, italic, images, links) to HTML */
function inlineMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" class="my-2 max-w-full rounded-lg" />')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

function embedYouTubeVideos(html: string): string {
  const ytRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})(?:[&?][^\s<"')]*)?/g;
  return html.replace(ytRegex, (match, videoId) => {
    const idx = html.indexOf(match);
    const before = html.slice(Math.max(0, idx - 10), idx);
    if (before.includes('src="') || before.includes("src='")) return match;
    return `<div class="my-4 aspect-video w-full max-w-2xl"><iframe src="https://www.youtube.com/embed/${videoId}" class="h-full w-full rounded-lg" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`;
  });
}

interface QuestionData { id: string; questionText: string; questionType: string; options: string[]; sortOrder: number; }
interface QuizData { id: string; title: string; description: string | null; status: string; questions: QuestionData[]; }
interface AttemptResult { score: number; passed: boolean; correctCount: number; totalCount: number; wrongQuestionIndices?: number[]; wrongQuestionTexts?: string[]; toolName?: string; quizRole?: string; }

export default function QuizTakingPage() {
  const { id } = useParams<{ id: string }>();
  const [quiz, setQuiz] = useState<QuizData | null>(null);
  const [answers, setAnswers] = useState<Record<string, number | number[]>>({});
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    apiFetch<QuizData>(`/api/inductions/quizzes/${id}`)
      .then((data) => {
        if (data.questions) {
          data.questions = data.questions.map((q) => ({
            ...q,
            options: typeof q.options === "string" ? JSON.parse(q.options) : q.options,
          }));
        }
        setQuiz(data);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  const handleSelect = (questionId: string, optionIndex: number) => {
    setAnswers((prev) => ({ ...prev, [questionId]: optionIndex }));
  };

  const handleMultiSelect = (questionId: string, optionIndex: number, checked: boolean) => {
    setAnswers((prev) => {
      const current = Array.isArray(prev[questionId]) ? (prev[questionId] as number[]) : [];
      const next = checked ? [...current, optionIndex] : current.filter((i) => i !== optionIndex);
      return { ...prev, [questionId]: next };
    });
  };

  const handleSubmit = async () => {
    if (!quiz) return;
    const sortedQuestions = [...quiz.questions].sort((a, b) => a.sortOrder - b.sortOrder);
    const unanswered = sortedQuestions.filter((q) => answers[q.id] === undefined);
    if (unanswered.length > 0) { setError("Please answer all questions before submitting."); return; }
    setSubmitting(true);
    setError("");
    try {
      const answerArray = sortedQuestions.map((q) => answers[q.id]);
      const res = await apiFetch<AttemptResult>(`/api/inductions/quizzes/${id}/attempt`, {
        method: "POST",
        body: JSON.stringify({ answers: answerArray }),
      });
      setResult(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Submission failed");
    } finally { setSubmitting(false); }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="h-6 w-6 animate-spin rounded-full border-2 border-hacman-yellow border-t-transparent" /></div>;
  if (error && !quiz) return <p className="text-red-400">{error}</p>;
  if (!quiz) return null;

  const sortedQuestions = [...quiz.questions].sort((a, b) => a.sortOrder - b.sortOrder);

  if (result) {
    const toolName = result.toolName ?? quiz.title;
    const getPassMessage = () => {
      switch (result.quizRole) {
        case "online_induction": return { title: `Congratulations, you are now trained on ${toolName}!`, detail: "The membership system will soon be updated to reflect your new certification." };
        case "pre_induction": return { title: `You've passed the pre-induction quiz for ${toolName}!`, detail: "You're now ready to book your in-person induction session. Contact a trainer to arrange this." };
        case "refresher": return { title: `Your training is refreshed for ${toolName}!`, detail: "Your certification has been renewed. Keep an eye on the expiry date." };
        default: return { title: "Congratulations, you passed!", detail: "Your certification has been confirmed." };
      }
    };

    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <h2 className="text-xl font-semibold text-white">{quiz.title} — Result</h2>
        {result.passed ? (
          <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-8 text-center">
            <p className="text-3xl mb-2">🎉</p>
            <p className="text-xl font-bold text-green-400">{getPassMessage().title}</p>
            <p className="mt-2 text-green-400/80">Score: {result.score}% ({result.correctCount}/{result.totalCount})</p>
            <p className="mt-2 text-sm text-green-400/70">{getPassMessage().detail}</p>
            <Link to="/inductions/profile" className="mt-6 inline-block rounded-lg bg-green-600 px-5 py-2.5 text-white font-medium hover:bg-green-700 transition-colors">
              Back to Profile
            </Link>
          </div>
        ) : (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-8 text-center">
            <p className="text-2xl font-bold text-red-400">Not Passed</p>
            <p className="mt-2 text-red-400/80">Score: {result.score}% ({result.correctCount}/{result.totalCount})</p>
            <p className="mt-1 text-sm text-red-400/70">You need 100% to pass. Please review and try again.</p>
            {result.wrongQuestionTexts && result.wrongQuestionTexts.length > 0 && (
              <div className="mt-4 text-left">
                <p className="text-sm font-medium text-red-400 mb-2">You got these questions wrong:</p>
                <ul className="space-y-1">
                  {result.wrongQuestionTexts.map((text, i) => (
                    <li key={i} className="text-sm text-red-400/80 flex items-start gap-2">
                      <span className="text-red-500 mt-0.5">✗</span><span>{text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <button onClick={() => { setResult(null); setAnswers({}); setError(""); }}
              className="mt-6 rounded-lg bg-red-600 px-5 py-2.5 text-white font-medium hover:bg-red-700 transition-colors">
              Retake Quiz
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h2 className="text-xl font-semibold text-white">{quiz.title}</h2>
      {quiz.description && (
        <div className="prose prose-invert prose-sm max-w-none rounded-xl border border-hacman-gray bg-hacman-dark p-4"
          dangerouslySetInnerHTML={{ __html: embedYouTubeVideos(markdownToHtml(quiz.description)) }} />
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="space-y-4">
        {sortedQuestions.map((q, qi) => (
          <fieldset key={q.id} className="rounded-xl border border-hacman-gray bg-hacman-dark p-4">
            <legend className="px-2 text-sm font-medium text-gray-300">
              Question {qi + 1}
              {q.questionType === "multi_select" && <span className="ml-2 text-xs font-normal text-hacman-muted">(select all that apply)</span>}
            </legend>
            <div className="mb-3 text-gray-200" dangerouslySetInnerHTML={{ __html: inlineMarkdown(q.questionText) }} />
            <div className="space-y-2">
              {q.options.map((opt, oi) => (
                <label key={oi} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-hacman-gray transition-colors">
                  {q.questionType === "multi_select" ? (
                    <input type="checkbox" checked={Array.isArray(answers[q.id]) && (answers[q.id] as number[]).includes(oi)}
                      onChange={(e) => handleMultiSelect(q.id, oi, e.target.checked)} className="accent-hacman-yellow" />
                  ) : (
                    <input type="radio" name={`q-${q.id}`} checked={answers[q.id] === oi}
                      onChange={() => handleSelect(q.id, oi)} className="accent-hacman-yellow" />
                  )}
                  <span className="text-sm text-gray-300">{opt}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
      <button onClick={handleSubmit} disabled={submitting}
        className="rounded-lg bg-hacman-yellow px-6 py-2.5 font-semibold text-hacman-black hover:bg-hacman-yellow-dark disabled:opacity-50 transition-colors">
        {submitting ? "Submitting…" : "Submit Answers"}
      </button>
    </div>
  );
}
