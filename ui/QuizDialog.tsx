import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, X, LoaderCircle, ArrowRight, RotateCcw } from "lucide-react";
import type { QuizSummary, QuizTarget, QuizView } from "../src/quiz";
import { quizScope, type Practice } from "../src/quiz";
import type { NormalAttachment } from "../src/domain";
import { localizeMessage } from "../src/localization";

type Props = {
  target: QuizTarget;
  initialRequest: string;
  contextTitle?: string;
  attachments?: NormalAttachment[];
  sk: boolean;
  command: <T>(action: string, value?: unknown) => Promise<T>;
  renderText: (text: string) => ReactNode;
  onClose: () => void;
  onChanged: () => Promise<void>;
};
export function QuizDialog({
  target,
  initialRequest,
  contextTitle,
  attachments = [],
  sk,
  command,
  renderText,
  onClose,
  onChanged,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null),
    lock = useRef(false),
    started = useRef(false);
  const [quiz, setQuiz] = useState<QuizView | null>(null),
    [history, setHistory] = useState<QuizSummary[]>([]);
  const [request, setRequest] = useState(initialRequest);
  const [practice, setPractice] = useState<Practice>({});
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [answer, setAnswer] = useState("");
  const [progressText, setProgressText] = useState("");
  const [generating, setGenerating] = useState(false);
  useEffect(
    () =>
      window.studyflow?.onEvent((event) => {
        if (event.kind === "processing") setProgressText(event.text);
      }),
    [],
  );
  const t = (en: string, slovak: string) => (sk ? slovak : en);
  async function run(work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError(localizeMessage((e as Error).message, sk ? "sk" : "en"));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function refresh() {
    setHistory(await command<QuizSummary[]>("quizList", target));
  }
  async function create(text: string) {
    setGenerating(true);
    setProgressText("");
    try {
      const generated = await command<QuizView>("quizGenerate", {
        target:
          "lessonId" in target ? { ...target, scope: quizScope(text) } : target,
        request: text,
        attachments,
        practice,
      });
      setQuiz(generated);
      setAnswer("");
      await Promise.all([refresh(), onChanged()]);
    } finally {
      setGenerating(false);
    }
  }
  async function generate(text = request) {
    await run(() => create(text));
  }
  useEffect(() => {
    dialog.current?.showModal();
    if (started.current) return;
    started.current = true;
    if (initialRequest) void generate(initialRequest);
    else
      void run(async () => {
        const saved = await command<QuizSummary[]>("quizList", target);
        setHistory(saved);
        const pending = saved.find((q) => !q.complete);
        if (pending) setQuiz(await command<QuizView>("quizGet", pending.id));
        else await create("");
      });
  }, []);
  const q = quiz?.question,
    feedback = quiz?.feedback;
  useEffect(() => {
    dialog.current?.scrollTo({ top: 0 });
    dialog.current
      ?.querySelector<HTMLElement>(".quiz-question, .quiz-results h3")
      ?.focus({ preventScroll: true });
  }, [quiz?.id, quiz?.position]);
  useEffect(() => {
    if (!busy && quiz?.feedback)
      dialog.current?.querySelector<HTMLButtonElement>(".quiz-next")?.focus();
  }, [busy, quiz?.id, quiz?.position, quiz?.feedback]);
  return (
    <dialog
      ref={dialog}
      className="quiz-dialog"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header className="quiz-heading">
        <div>
          <span className="eyebrow">
            {t("OPTIONAL PRACTICE", "VOLITEĽNÉ PRECVIČOVANIE")}
          </span>
          {contextTitle && <p className="quiz-context">{contextTitle}</p>}
          <h2>{quiz?.title ?? t("Practice & quizzes", "Cvičenia a kvízy")}</h2>
        </div>
        <button
          className="icon-button"
          aria-label={t("Close quiz", "Zavrieť kvíz")}
          disabled={busy}
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </header>
      <p className="hint">
        {t(
          "Your lesson progress stays under your control. Quizzes never complete lessons automatically.",
          "Dokončenie lekcie je na tebe. Kvíz nikdy automaticky nedokončí lekciu.",
        )}
      </p>
      {error && (
        <div className="quiz-error" role="alert">
          {error}
        </div>
      )}
      {busy && (
        <div className="quiz-loading" role="status">
          <LoaderCircle className="spin" size={22} />
          <span>
            {quiz && !generating
              ? t("Checking your answer…", "Kontrolujem tvoju odpoveď…")
              : progressText
                ? localizeMessage(progressText, sk ? "sk" : "en")
                : t(
                    "Preparing and checking your questions…",
                    "Pripravujem a overujem tvoje otázky…",
                  )}
          </span>
          <button
            className="text-button"
            onClick={() => void command("cancel")}
          >
            {t("Cancel", "Zrušiť")}
          </button>
        </div>
      )}
      <details className="quiz-customize">
        <summary>
          {t("Customize practice", "Prispôsobiť precvičovanie")}
        </summary>
        <fieldset disabled={busy} className="quiz-setup">
          <div className="quiz-settings">
            <label>
              {t("Exercise type", "Typ cvičenia")}
              <select
                aria-label={t("Exercise type", "Typ cvičenia")}
                value={practice.type ?? "multiple_choice"}
                onChange={(e) =>
                  setPractice((p) => ({
                    ...p,
                    type: e.target.value as Practice["type"],
                  }))
                }
              >
                <option value="multiple_choice">
                  {t("Multiple Choice (ABCD)", "Výber odpovede (ABCD)")}
                </option>
                <option value="short_answer">
                  {t("Written Answer", "Písomná odpoveď")}
                </option>
                <option value="coding">
                  {t("Coding Exercise", "Programovacia úloha")}
                </option>
                <option value="math">
                  {t("Math Exercise", "Matematická úloha")}
                </option>
              </select>
            </label>
            <label>
              {t("Questions", "Otázky")}
              <select
                aria-label={t("Number of questions", "Počet otázok")}
                value={practice.count ?? 4}
                onChange={(e) =>
                  setPractice((p) => ({ ...p, count: Number(e.target.value) }))
                }
              >
                {Array.from({ length: 10 }, (_, i) => (
                  <option key={i} value={i + 1}>
                    {i + 1}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("Difficulty", "Náročnosť")}
              <select
                aria-label={t("Difficulty", "Náročnosť")}
                value={practice.difficulty ?? "auto"}
                onChange={(e) =>
                  setPractice((p) => ({
                    ...p,
                    difficulty: e.target.value as Practice["difficulty"],
                  }))
                }
              >
                <option value="auto">{t("Adaptive", "Podľa lekcie")}</option>
                <option value="easy">{t("Easy", "Ľahká")}</option>
                <option value="medium">{t("Medium", "Stredná")}</option>
                <option value="hard">{t("Hard", "Náročná")}</option>
              </select>
            </label>
          </div>
          <label htmlFor="quiz-request">
            {t(
              "Specific topic or instructions (optional)",
              "Konkrétna téma alebo pokyny (voliteľné)",
            )}
          </label>
          <textarea
            id="quiz-request"
            rows={2}
            maxLength={4000}
            value={request}
            onChange={(e) => setRequest(e.target.value)}
            placeholder={t(
              "Leave blank to practice the important concepts of this lesson.",
              "Nechaj prázdne pre precvičenie dôležitých pojmov tejto lekcie.",
            )}
          />
          {"lessonId" in target && (
            <p className="hint">
              {quizScope(request) === "course"
                ? t(
                    "Scope: entire presentation/course",
                    "Rozsah: celá prezentácia/kurz",
                  )
                : t(
                    "Scope: current lesson. Close and request a quiz on the entire presentation in chat to change scope.",
                    "Rozsah: aktuálna lekcia. Pre celý materiál napíš do chatu žiadosť o kvíz z celej prezentácie.",
                  )}
            </p>
          )}
          <button className="primary" onClick={() => void generate()}>
            {t("Generate questions", "Vytvoriť otázky")}
          </button>
        </fieldset>
      </details>
      {!quiz && !busy && error && (
        <button className="primary" onClick={() => void generate()}>
          {t("Try again", "Skúsiť znova")}
        </button>
      )}
      {quiz && (
        <>
          <div className="quiz-progress-label">
            <span>
              {quiz.complete
                ? t("Quiz complete", "Kvíz dokončený")
                : `${t("Question", "Otázka")} ${quiz.position + 1} / ${quiz.total}`}
            </span>
            <span>
              {quiz.answered}/{quiz.total} {t("answered", "zodpovedaných")}
            </span>
          </div>
          <div
            className="progress-track quiz-progress"
            role="progressbar"
            aria-label={t("Quiz progress", "Pokrok kvízu")}
            aria-valuemin={0}
            aria-valuemax={quiz.total}
            aria-valuenow={quiz.answered}
          >
            <span style={{ width: `${(quiz.answered / quiz.total) * 100}%` }} />
          </div>
          {q && (
            <section className="quiz-card">
              <div className="quiz-topic">
                <span>{q.topic}</span>
                <span>
                  {
                    {
                      easy: t("Easy", "Ľahká"),
                      medium: t("Medium", "Stredná"),
                      hard: t("Hard", "Náročná"),
                    }[q.difficulty]
                  }
                </span>
              </div>
              <div className="prose quiz-question" tabIndex={-1}>
                {renderText(q.prompt)}
              </div>
              {q.references.length > 0 && (
                <small className="muted">{q.references.join(" · ")}</small>
              )}
              {q.options.length > 0 ? (
                <div
                  className="quiz-options"
                  role="radiogroup"
                  aria-label={t("Answer options", "Možnosti odpovede")}
                >
                  {q.options.map((option, index) => {
                    const selected =
                        (feedback?.answer ?? answer) === String(index),
                      correct = feedback?.correctOption === index;
                    return (
                      <button
                        key={index}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        tabIndex={selected || (!answer && index === 0) ? 0 : -1}
                        disabled={busy || !!feedback}
                        className={`quiz-option ${selected ? "selected" : ""} ${feedback ? (correct ? "correct" : selected ? "incorrect" : "") : ""}`}
                        onClick={() => setAnswer(String(index))}
                        onKeyDown={(event) => {
                          if (
                            ![
                              "ArrowDown",
                              "ArrowRight",
                              "ArrowUp",
                              "ArrowLeft",
                              "Home",
                              "End",
                            ].includes(event.key)
                          )
                            return;
                          event.preventDefault();
                          const next =
                            event.key === "Home"
                              ? 0
                              : event.key === "End"
                                ? q.options.length - 1
                                : (index +
                                    (event.key === "ArrowDown" ||
                                    event.key === "ArrowRight"
                                      ? 1
                                      : -1) +
                                    q.options.length) %
                                  q.options.length;
                          setAnswer(String(next));
                          const group = event.currentTarget.parentElement;
                          group
                            ?.querySelectorAll<HTMLButtonElement>("button")
                            [next]?.focus();
                        }}
                      >
                        <span className="option-letter">
                          {String.fromCharCode(65 + index)}
                        </span>
                        <span className="prose">{renderText(option)}</span>
                        {feedback && correct && <Check size={18} />}
                        {feedback && selected && !correct && <X size={18} />}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <label className="quiz-written">
                  {t("Your answer", "Tvoja odpoveď")}
                  <textarea
                    aria-label={t("Exercise answer", "Odpoveď na cvičenie")}
                    className={q.type === "coding" ? "code-answer" : ""}
                    rows={5}
                    maxLength={8000}
                    value={feedback?.answer ?? answer}
                    disabled={busy || !!feedback}
                    onChange={(e) => setAnswer(e.target.value)}
                  />
                  <small className="muted">
                    {t(
                      "Written answers receive AI feedback. Code is reviewed, never executed.",
                      "Písomné odpovede hodnotí AI. Kód sa kontroluje, nikdy nespúšťa.",
                    )}
                  </small>
                </label>
              )}
              {feedback ? (
                <div
                  className={`quiz-feedback ${feedback.correct ? "correct" : "incorrect"}`}
                  role="status"
                >
                  <strong>
                    {feedback.correct
                      ? t("Correct", "Správne")
                      : t("Not quite", "Nie celkom správne")}
                  </strong>
                  <div className="prose">
                    {renderText(feedback.explanation)}
                  </div>
                </div>
              ) : (
                <button
                  className="primary quiz-submit"
                  disabled={busy || !answer.trim()}
                  onClick={() =>
                    void run(async () => {
                      setQuiz(
                        await command<QuizView>("quizAnswer", {
                          id: quiz.id,
                          index: quiz.position,
                          answer,
                        }),
                      );
                      await refresh();
                    })
                  }
                >
                  {t("Submit answer", "Odovzdať odpoveď")}
                </button>
              )}
              {feedback && (
                <button
                  className="primary quiz-next"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      setQuiz(
                        await command<QuizView>("quizNext", {
                          id: quiz.id,
                          index: quiz.position,
                        }),
                      );
                      setAnswer("");
                      await refresh();
                    })
                  }
                >
                  {quiz.position === quiz.total - 1
                    ? t("Show results", "Zobraziť výsledky")
                    : t("Next question", "Ďalšia otázka")}
                  <ArrowRight size={16} />
                </button>
              )}
            </section>
          )}
          {quiz.complete && (
            <section className="quiz-results">
              <div className="quiz-score">
                {Math.round((quiz.correct / quiz.total) * 100)}
                <small>%</small>
              </div>
              <h3 tabIndex={-1}>
                {quiz.correct}/{quiz.total}{" "}
                {t("correct answers", "správnych odpovedí")}
              </h3>
              <p>
                {t("Topics to review:", "Témy na zopakovanie:")}{" "}
                {[
                  ...new Set(
                    quiz.results?.filter((r) => !r.correct).map((r) => r.topic),
                  ),
                ].join(", ") ||
                  t(
                    "None from this quiz. Well done!",
                    "V tomto kvíze žiadne. Výborne!",
                  )}
              </p>
              {quiz.results?.map((result, index) => (
                <details
                  className={`quiz-review ${result.correct ? "correct" : "incorrect"}`}
                  key={index}
                >
                  <summary>
                    {result.correct ? (
                      <Check size={15} />
                    ) : (
                      <RotateCcw size={15} />
                    )}{" "}
                    {index + 1}. {result.topic}
                  </summary>
                  <div className="prose">
                    {renderText(result.prompt)}
                    <div>
                      <strong>{t("Your answer:", "Tvoja odpoveď:")}</strong>{" "}
                      {renderText(result.answer)}
                    </div>
                    {result.correctAnswer && (
                      <div>
                        <strong>
                          {t("Correct answer:", "Správna odpoveď:")}
                        </strong>{" "}
                        {renderText(result.correctAnswer)}
                      </div>
                    )}
                    {renderText(result.explanation)}
                  </div>
                </details>
              ))}
            </section>
          )}
          {!busy && (
            <button
              className="text-button quiz-new"
              onClick={() => void generate()}
            >
              {t("Create another quiz", "Vytvoriť ďalší kvíz")}
            </button>
          )}
        </>
      )}
      {!busy && history.length > 0 && (
        <details className="quiz-history">
          <summary>
            {t("Saved quizzes", "Uložené kvízy")} · {history.length}
          </summary>
          {history.map((item) => (
            <button
              className="text-button"
              key={item.id}
              onClick={() =>
                void run(async () => {
                  setQuiz(await command<QuizView>("quizGet", item.id));
                  setAnswer("");
                })
              }
            >
              {item.title} · {item.answered}/{item.total}
              {item.complete ? " ✓" : ""}
            </button>
          ))}
        </details>
      )}
    </dialog>
  );
}
