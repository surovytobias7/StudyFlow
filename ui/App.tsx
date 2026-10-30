import React, { useEffect, useRef, useState } from "react";

import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import {
  ArrowUp,
  ArrowRight,
  ArrowLeft,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  FileText,
  GraduationCap,
  LayoutDashboard,
  List,
  LoaderCircle,
  MessageSquare,
  Moon,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  Sparkles,
  Square,
  Sun,
  Upload,
  X,
  RotateCcw,
  Lightbulb,
  Code,
  Dumbbell,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
import type { Snapshot, Plan, Material } from "../src/domain";
import "katex/dist/katex.min.css";
import "./style.css";

type Connection = {
  connected: boolean;
  planEnabled: boolean;
  account: string;
  models: { slug: string; display_name: string }[];
};
type Event = { kind: string; text: string; lessonId?: string };
declare global {
  interface Window {
    studyflow?: {
      command: (
        action: string,
        value?: unknown,
      ) => Promise<{ ok: boolean; data?: unknown; error?: string }>;
      onEvent: (callback: (event: Event) => void) => () => void;
    };
  }
}
const empty: Snapshot = {
  courses: [],
  course: null,
  lessons: [],
  messages: [],
  sources: [],
  settings: { language: "en", tutorLanguage: "sk", theme: "dark", model: "" },
};
async function call<T>(action: string, value?: unknown): Promise<T> {
  if (!window.studyflow) {
    if (action === "snapshot") return empty as T;
    if (action === "status")
      return {
        connected: false,
        models: [],
        account: "",
        planEnabled: false,
      } as T;
    throw new Error(
      "Open the StudyFlow desktop application to use local files and your ChatGPT connection.",
    );
  }
  const result = await window.studyflow.command(action, value);
  if (!result.ok) throw new Error(result.error ?? "Operation failed.");
  return result.data as T;
}
function RichText({ children }: { children: string }) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex, rehypeHighlight]}
      components={{
        a: ({ children }) => <span className="source-link">{children}</span>,
        img: ({ alt }) => <span>{alt}</span>,
      }}
    >
      {children}
    </Markdown>
  );
}
function SourceDialog({
  material,
  close,
  sk,
}: {
  material: Material;
  close: () => void;
  sk: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog ref={ref} className="source-dialog" onCancel={close}>
      <div className="row">
        <h2>{material.name}</h2>
        <button
          className="icon-button"
          aria-label={sk ? "Zavrieť" : "Close"}
          onClick={close}
        >
          <X size={18} />
        </button>
      </div>
      <p>{material.warning}</p>
      <pre>{material.text}</pre>
      {material.images.map((image) => (
        <figure key={image.label}>
          <img src={image.url} alt={image.label} />
          <figcaption>{image.label}</figcaption>
        </figure>
      ))}
    </dialog>
  );
}
export default function App() {
  const [data, setData] = useState<Snapshot>(empty);
  const [connection, setConnection] = useState<Connection>({
    connected: false,
    models: [],
    account: "",
    planEnabled: false,
  });
  const [view, setView] = useState<"home" | "learn" | "new" | "settings">(
    "home",
  );
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [stream, setStream] = useState("");
  const [draft, setDraft] = useState("");
  const [transcript, setTranscript] = useState("");
  const [title, setTitle] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [search, setSearch] = useState("");
  const [undo, setUndo] = useState("");
  const [pathVisible, setPathVisible] = useState(true);
  const [overview, setOverview] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const activeId = data.course?.activeLessonId;
  const lesson = data.lessons.find((l) => l.id === activeId);
  const activeRef = useRef(activeId);
  activeRef.current = activeId;
  const [plan, setPlan] = useState<Plan | null>(null);
  const [source, setSource] = useState<Material | null>(null);
  const sk = data.settings.language === "sk";
  const t = (en: string, slovak: string) => (sk ? slovak : en);
  const progress = data.course?.total
    ? Math.round((data.course.completed / data.course.total) * 100)
    : 0;

  useEffect(() => {
    let mounted = true;
    Promise.all([call<Snapshot>("snapshot"), call<Connection>("status")])
      .then(([snapshot, status]) => {
        if (!mounted) return;
        setData(snapshot);
        setConnection(status);
        if (snapshot.course) setView("learn");
        if (status.connected)
          call<Connection>("models")
            .then((value) => {
              if (mounted) setConnection(value);
            })
            .catch(() => {});
      })
      .catch((err) => {
        if (mounted) setError(err.message);
      });
    const off = window.studyflow?.onEvent((event) => {
      if (event.kind === "delta" && event.lessonId === activeRef.current)
        setStream((text) => text + event.text);
      if (event.kind === "status" || event.kind === "processing")
        setNotice(event.text);
    });
    return () => {
      mounted = false;
      off?.();
    };
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = data.settings.theme;
    document.documentElement.lang = sk ? "sk" : "en";
  }, [data.settings.theme, sk]);
  useEffect(() => {
    setStream("");
    setDraft("");
    setOverview(false);
    if (scroller.current) scroller.current.scrollTop = 0;
  }, [activeId]);
  useEffect(() => {
    if (data.course && !data.course.started)
      setPlan({
        title: data.course.title,
        lessons: data.lessons.map(({ title, objective, references }) => ({
          title,
          objective,
          references,
        })),
      });
    else setPlan(null);
  }, [data.course?.id, data.course?.started]);
  useEffect(() => {
    const el = scroller.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 250)
      el.scrollTop = el.scrollHeight;
  }, [stream]);

  async function run(work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function explain(snapshot: Snapshot) {
    const id = snapshot.course?.activeLessonId;
    if (
      !id ||
      snapshot.messages.some(
        (m) => m.role === "assistant" && m.status === "complete",
      )
    )
      return;
    activeRef.current = id;
    setStream("");
    try {
      setData(
        await call<Snapshot>("chat", {
          lessonId: id,
          question: "",
          mode: "chat",
        }),
      );
    } finally {
      setStream("");
    }
  }
  function navigate(id: string) {
    void run(async () => {
      const snapshot = await call<Snapshot>("activate", id);
      setData(snapshot);
      setView("learn");
      await explain(snapshot);
    });
  }
  function openCourse(id: string) {
    void run(async () => {
      const snapshot = await call<Snapshot>("snapshot", id);
      setData(snapshot);
      setView("learn");
    });
  }
  function chat(question: string, mode = "chat") {
    if (!activeId || !question.trim()) return;
    void run(async () => {
      const id = activeId;
      setDraft("");
      setStream("");
      setData((value) => ({
        ...value,
        messages: [
          ...value.messages,
          {
            id: crypto.randomUUID(),
            lessonId: id,
            role: "user",
            content: question,
            status: "complete",
            createdAt: new Date().toISOString(),
          },
        ],
      }));
      try {
        setData(await call<Snapshot>("chat", { lessonId: id, question, mode }));
      } finally {
        setStream("");
        setData(await call<Snapshot>("snapshot", data.course!.id));
      }
    });
  }
  function complete() {
    if (!activeId) return;
    void run(async () => {
      const operationId = crypto.randomUUID();
      const snapshot = await call<Snapshot>("complete", {
        lessonId: activeId,
        operationId,
      });
      setData(snapshot);
      setUndo(operationId);
      await explain(snapshot);
    });
  }
  function importFile() {
    void run(async () => {
      const snapshot = await call<Snapshot | null>("import");
      if (snapshot) {
        setData(snapshot);
        setView("learn");
      }
    });
  }
  function saveSettings(patch: Record<string, string>) {
    void run(async () => {
      const settings = {
        language: data.settings.language,
        tutorLanguage: data.settings.tutorLanguage,
        theme: data.settings.theme,
        model: data.settings.model,
        ...patch,
      };
      setData(await call<Snapshot>("settings", settings));
    });
  }
  const quick = [
    {
      icon: Lightbulb,
      en: "Explain simply",
      sk: "Jednoduchšie",
      prompt: t(
        "Explain the current concept more simply.",
        "Vysvetli aktuálny koncept jednoduchšie.",
      ),
    },
    {
      icon: Code,
      en: "Give an example",
      sk: "Daj príklad",
      prompt: t(
        "Give me a practical example of this lesson.",
        "Daj mi praktický príklad k tejto lekcii.",
      ),
    },
    {
      icon: Dumbbell,
      en: "Try an exercise",
      sk: "Precvičiť",
      prompt: t(
        "Give me one exercise without revealing the solution.",
        "Daj mi jedno cvičenie bez prezradenia riešenia.",
      ),
      mode: "exercise",
    },
    {
      icon: Sparkles,
      en: "Go deeper",
      sk: "Podrobnejšie",
      prompt: t(
        "Explain this concept in more detail.",
        "Vysvetli tento koncept podrobnejšie.",
      ),
    },
    {
      icon: MessageSquare,
      en: "Test me",
      sk: "Otestuj ma",
      prompt: t(
        "Ask one short question to test my understanding. Wait for my answer.",
        "Polož mi jednu krátku otázku na overenie porozumenia. Počkaj na moju odpoveď.",
      ),
      mode: "exercise",
    },
  ];
  return (
    <div className="app-shell">
      {source && (
        <SourceDialog material={source} close={() => setSource(null)} sk={sk} />
      )}
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-icon">
            <GraduationCap size={20} />
          </span>
          <strong>StudyFlow</strong>
          <span className="local-badge">local</span>
        </div>
        <button
          className="new-button"
          disabled={busy}
          onClick={() => setView("new")}
        >
          <Plus size={16} />
          {t("New learning session", "Nové štúdium")}
          <kbd>+</kbd>
        </button>
        <nav aria-label={t("Main navigation", "Hlavná navigácia")}>
          <button
            className={view === "home" ? "nav active" : "nav"}
            disabled={busy}
            onClick={() => setView("home")}
          >
            <LayoutDashboard size={16} />
            {t("Overview", "Prehľad")}
          </button>
          <button
            className={view === "learn" ? "nav active" : "nav"}
            disabled={busy || !data.course}
            onClick={() => setView("learn")}
          >
            <MessageSquare size={16} />
            {t("Learning workspace", "Pracovný priestor")}
          </button>
        </nav>
        <div className="sidebar-heading">
          {t("Your courses", "Tvoje kurzy")}
          <span>{data.courses.length}</span>
        </div>
        {data.courses.length > 4 && (
          <label className="search">
            <Search size={14} />
            <input
              aria-label={t("Search courses", "Hľadať kurzy")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("Search courses…", "Hľadať kurzy…")}
            />
          </label>
        )}
        <div className="course-list">
          {data.courses
            .filter((c) => c.title.toLowerCase().includes(search.toLowerCase()))
            .map((course) => (
              <button
                disabled={busy}
                key={course.id}
                className={`course-nav ${view === "learn" && data.course?.id === course.id ? "selected" : ""}`}
                onClick={() => openCourse(course.id)}
              >
                <BookOpen size={15} />
                <span>
                  {course.title}
                  <small>
                    {course.completed}/{course.total} {t("lessons", "lekcií")}
                  </small>
                </span>
                {course.completed === course.total && course.total > 0 ? (
                  <Check size={13} className="green" />
                ) : (
                  <ChevronRight size={13} />
                )}
              </button>
            ))}
          {!data.courses.length && (
            <p className="sidebar-empty">
              {t(
                "Your learning paths will appear here.",
                "Tu sa zobrazia tvoje študijné plány.",
              )}
            </p>
          )}
        </div>
        <div className="sidebar-bottom">
          <button
            className={view === "settings" ? "nav active" : "nav"}
            disabled={busy}
            onClick={() => setView("settings")}
          >
            <Settings size={16} />
            {t("Settings", "Nastavenia")}
          </button>
          <button
            className="account"
            disabled={busy}
            onClick={() => setView("settings")}
          >
            <span className="avatar">
              {connection.connected
                ? connection.account[0]?.toUpperCase()
                : "S"}
            </span>
            <span>
              {connection.connected
                ? t("ChatGPT connected", "ChatGPT pripojený")
                : t("Connect ChatGPT", "Pripojiť ChatGPT")}
              <small>
                <i className={connection.connected ? "online" : ""} />
                {t("Local workspace", "Lokálny priestor")}
              </small>
            </span>
            <ChevronDown size={14} />
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            <BookOpen size={15} />
            <span>
              {view === "learn"
                ? data.course?.title
                : view === "new"
                  ? t("New learning session", "Nové štúdium")
                  : view === "settings"
                    ? t("Settings", "Nastavenia")
                    : t("Overview", "Prehľad")}
            </span>
            {lesson && view === "learn" && (
              <>
                <ChevronRight size={13} />
                <span className="muted">
                  {t("Lesson", "Lekcia")} {lesson.position + 1}
                </span>
              </>
            )}
          </div>
          <div className="top-actions">
            <span className="saved">
              <span />
              {t("Saved locally", "Uložené lokálne")}
            </span>
            <button
              className="icon-button"
              aria-label={t("Toggle theme", "Prepnúť vzhľad")}
              disabled={busy}
              onClick={() =>
                saveSettings({
                  theme: data.settings.theme === "dark" ? "light" : "dark",
                })
              }
            >
              {data.settings.theme === "dark" ? (
                <Sun size={16} />
              ) : (
                <Moon size={16} />
              )}
            </button>
            {view === "learn" && (
              <button
                className="icon-button"
                aria-label={t("Toggle learning path", "Zobraziť študijný plán")}
                onClick={() => setPathVisible(!pathVisible)}
              >
                {pathVisible ? (
                  <PanelRightClose size={17} />
                ) : (
                  <PanelRightOpen size={17} />
                )}
              </button>
            )}
          </div>
        </header>
        {error && (
          <div className="error-banner" role="alert">
            <span>{error}</span>
            <button
              className="icon-button"
              aria-label={t("Dismiss error", "Zavrieť chybu")}
              onClick={() => setError("")}
            >
              <X size={15} />
            </button>
          </div>
        )}
        {busy && notice && (
          <div className="processing" role="status">
            <LoaderCircle size={14} className="spin" />
            {notice}
          </div>
        )}
        <main className="main-content">
          {view === "home" && (
            <div className="page overview-page">
              <div className="page-heading">
                <div>
                  <h1>
                    {t(
                      "Your learning, at your pace.",
                      "Uč sa vlastným tempom.",
                    )}
                  </h1>
                  <p>
                    {t(
                      "Pick up where you left off, or start with something new.",
                      "Pokračuj tam, kde si skončil, alebo začni niečo nové.",
                    )}
                  </p>
                </div>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => setView("new")}
                >
                  <Plus size={16} />
                  {t("New session", "Nové štúdium")}
                </button>
              </div>
              <div className="stats">
                <div>
                  <strong>{data.courses.length}</strong>
                  <span>{t("Courses", "Kurzov")}</span>
                </div>
                <div>
                  <strong>
                    {data.courses.reduce((n, c) => n + c.completed, 0)}
                  </strong>
                  <span>{t("Lessons completed", "Dokončených lekcií")}</span>
                </div>
                <div>
                  <strong>
                    {data.courses.reduce(
                      (n, c) => n + c.total - c.completed,
                      0,
                    )}
                  </strong>
                  <span>{t("Lessons ahead", "Zostávajúcich lekcií")}</span>
                </div>
              </div>
              <h2>{t("Your courses", "Tvoje kurzy")}</h2>
              {data.courses.length ? (
                <div className="course-grid">
                  {data.courses.map((course) => (
                    <button
                      className="course-card"
                      key={course.id}
                      disabled={busy}
                      onClick={() => openCourse(course.id)}
                    >
                      <BookOpen size={20} />
                      <h3>{course.title}</h3>
                      <p>
                        {course.completed} / {course.total}{" "}
                        {t("lessons completed", "lekcií dokončených")}
                      </p>
                      <div className="progress-track">
                        <span
                          style={{
                            width: `${course.total ? (course.completed / course.total) * 100 : 0}%`,
                          }}
                        />
                      </div>
                      <div className="card-bottom">
                        {course.started
                          ? t("Continue learning", "Pokračovať v štúdiu")
                          : t("Review learning path", "Prezrieť študijný plán")}
                        <ArrowRight size={15} />
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <div className="empty-icon">
                    <BookOpen size={28} />
                  </div>
                  <h2>
                    {t(
                      "A whole subject. One clear next step.",
                      "Celý predmet. Jeden jasný ďalší krok.",
                    )}
                  </h2>
                  <p>
                    {t(
                      "Bring your slides, notes or textbook. Your tutor will organize them into small lessons, with room for every question.",
                      "Pridaj prezentáciu, poznámky alebo učebnicu. Tvoj tútor ich rozdelí na malé lekcie s priestorom na každú otázku.",
                    )}
                  </p>
                  <button className="primary" onClick={() => setView("new")}>
                    <Plus size={16} />
                    {t("Create your first course", "Vytvoriť prvý kurz")}
                  </button>
                </div>
              )}
            </div>
          )}
          {view === "new" && (
            <div className="page import-page">
              <span className="section-icon">
                <Plus size={24} />
              </span>
              <h1>{t("What are we learning today?", "Čo sa dnes naučíme?")}</h1>
              <p>
                {t(
                  "Add your material. We’ll build a learning path you can review before the first lesson.",
                  "Pridaj materiál. Vytvoríme študijný plán, ktorý si môžeš upraviť pred prvou lekciou.",
                )}
              </p>
              {!connection.connected && (
                <div className="inline-note">
                  {t(
                    "Connect your ChatGPT account in Settings before generating a learning path.",
                    "Pred vytvorením študijného plánu pripoj ChatGPT v Nastaveniach.",
                  )}
                  <button onClick={() => setView("settings")}>
                    {t("Open settings", "Otvoriť nastavenia")}
                  </button>
                </div>
              )}
              <button
                className="upload-zone"
                onClick={importFile}
                disabled={busy || !connection.connected}
              >
                <Upload size={28} />
                <strong>
                  {t("Choose a learning material", "Vybrať študijný materiál")}
                </strong>
                <span>PDF, PowerPoint, PNG, JPG, WebP, TXT, Markdown</span>
                <small>
                  {t(
                    "Up to 30 MB · Stored on your computer",
                    "Do 30 MB · Uložené v tvojom počítači",
                  )}
                </small>
              </button>
              <label>
                {t(
                  "Educational webpage or YouTube URL",
                  "Odkaz na stránku alebo YouTube",
                )}
                <div className="row">
                  <input
                    type="url"
                    value={sourceUrl}
                    onChange={(e) => setSourceUrl(e.target.value)}
                    placeholder="https://…"
                  />
                  <button
                    className="secondary"
                    disabled={
                      busy || !connection.connected || !sourceUrl.trim()
                    }
                    onClick={() =>
                      void run(async () => {
                        const snapshot = await call<Snapshot>(
                          "url",
                          sourceUrl.trim(),
                        );
                        setData(snapshot);
                        setView("learn");
                      })
                    }
                  >
                    {t("Import", "Importovať")}
                  </button>
                </div>
              </label>
              <div className="or">
                <span />
                {t(
                  "or paste notes / a transcript",
                  "alebo vlož poznámky / prepis",
                )}
                <span />
              </div>
              <label>
                {t("Course name", "Názov kurzu")}
                <input
                  value={title}
                  maxLength={180}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t(
                    "e.g. Object-oriented programming",
                    "napr. Objektovo orientované programovanie",
                  )}
                />
              </label>
              <label>
                {t(
                  "Study notes or video transcript",
                  "Poznámky alebo prepis videa",
                )}
                <textarea
                  rows={7}
                  value={transcript}
                  maxLength={600000}
                  onChange={(e) => setTranscript(e.target.value)}
                  placeholder={t(
                    "Paste educational text here…",
                    "Sem vlož študijný text…",
                  )}
                />
              </label>
              <p className="hint">
                {t(
                  "Only the pasted text is analyzed. For a YouTube video without accessible captions, paste a transcript here.",
                  "Analyzuje sa iba vložený text. Ak video na YouTube nemá dostupné titulky, vlož sem prepis.",
                )}
              </p>
              <button
                className="primary"
                disabled={
                  busy ||
                  !connection.connected ||
                  !title.trim() ||
                  transcript.trim().length < 20
                }
                onClick={() =>
                  void run(async () => {
                    const result = await call<Snapshot>("transcript", {
                      title: title.trim(),
                      text: transcript.trim(),
                    });
                    setData(result);
                    setView("learn");
                  })
                }
              >
                {busy ? (
                  <LoaderCircle className="spin" size={16} />
                ) : (
                  <Sparkles size={16} />
                )}
                {t("Build learning path", "Vytvoriť študijný plán")}
              </button>
              {busy && (
                <button
                  className="secondary"
                  onClick={() => void call("cancel")}
                >
                  {t("Cancel", "Zrušiť")}
                </button>
              )}
            </div>
          )}
          {view === "settings" && (
            <div className="page settings-page">
              <h1>{t("Settings", "Nastavenia")}</h1>
              <p>
                {t(
                  "Make this workspace yours.",
                  "Prispôsob si svoj pracovný priestor.",
                )}
              </p>
              <section className="settings-section">
                <h2>{t("ChatGPT connection", "Pripojenie ChatGPT")}</h2>
                <p>
                  {connection.connected
                    ? connection.account
                    : t(
                        "Use your eligible ChatGPT plan for your personal tutor.",
                        "Použi svoj oprávnený plán ChatGPT pre osobného tútora.",
                      )}
                </p>
                <div className="row">
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        setConnection(await call<Connection>("login"));
                      })
                    }
                  >
                    {t("Continue with ChatGPT", "Continue with ChatGPT")}
                  </button>
                  {connection.connected && (
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          setConnection(await call<Connection>("disconnect"));
                        })
                      }
                    >
                      {t("Disconnect", "Odpojiť")}
                    </button>
                  )}
                  {busy && (
                    <button
                      className="secondary"
                      onClick={() => void call("cancel")}
                    >
                      {t("Cancel", "Zrušiť")}
                    </button>
                  )}
                </div>
                <p className="hint">
                  {t(
                    "Uses your shared plan allowance. No separately billed API fallback. Manage app limits in ChatGPT Settings → Usage.",
                    "Využíva zdieľaný limit plánu. Žiadne samostatne účtované API. Limity spravuješ v ChatGPT Nastavenia → Využitie.",
                  )}
                </p>
                {notice && !busy && <p role="status">{notice}</p>}
                <label>
                  {t("Tutor model", "Model tútora")}
                  <select
                    disabled={busy || !connection.models.length}
                    value={
                      data.settings.model || connection.models[0]?.slug || ""
                    }
                    onChange={(e) => saveSettings({ model: e.target.value })}
                  >
                    {!connection.models.length && (
                      <option value="">
                        {t(
                          "Connect to load models",
                          "Pripoj účet pre načítanie modelov",
                        )}
                      </option>
                    )}
                    {connection.models.map((model) => (
                      <option key={model.slug} value={model.slug}>
                        {model.display_name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="text-button"
                  disabled={busy || !connection.connected}
                  onClick={() =>
                    void run(async () =>
                      setConnection(await call<Connection>("models")),
                    )
                  }
                >
                  {t("Refresh available models", "Obnoviť dostupné modely")}
                </button>
              </section>
              <section className="settings-section">
                <h2>{t("Language & appearance", "Jazyk a vzhľad")}</h2>
                <label>
                  {t("Interface language", "Jazyk rozhrania")}
                  <select
                    disabled={busy}
                    value={data.settings.language}
                    onChange={(e) => saveSettings({ language: e.target.value })}
                  >
                    <option value="en">English</option>
                    <option value="sk">Slovenčina</option>
                  </select>
                </label>
                <label>
                  {t("Tutor explanation language", "Jazyk vysvetľovania")}
                  <select
                    disabled={busy}
                    value={data.settings.tutorLanguage}
                    onChange={(e) =>
                      saveSettings({ tutorLanguage: e.target.value })
                    }
                  >
                    <option value="en">English</option>
                    <option value="sk">Slovenčina</option>
                  </select>
                </label>
                <label>
                  {t("Appearance", "Vzhľad")}
                  <select
                    disabled={busy}
                    value={data.settings.theme}
                    onChange={(e) => saveSettings({ theme: e.target.value })}
                  >
                    <option value="dark">{t("Dark", "Tmavý")}</option>
                    <option value="light">{t("Light", "Svetlý")}</option>
                  </select>
                </label>
              </section>
              <section className="settings-section">
                <h2>
                  {t("Your data stays with you", "Tvoje dáta zostávajú u teba")}
                </h2>
                <p>
                  {t(
                    "Courses, materials, lesson conversations and progress are saved locally. Selected material and conversation context are sent to OpenAI when you request AI help. Existing lessons stay readable offline.",
                    "Kurzy, materiály, konverzácie a pokrok sú uložené lokálne. Vybraný materiál a kontext konverzácie sa posielajú OpenAI pri požiadavke na pomoc AI. Uložené lekcie sú dostupné aj offline.",
                  )}
                </p>
              </section>
            </div>
          )}
          {view === "learn" && data.course && (
            <div className="learning-layout">
              <div className="lesson-panel">
                {plan ? (
                  <div className="page plan-page">
                    <span className="section-icon">
                      <List size={24} />
                    </span>
                    <h1>
                      {t(
                        "Your learning path is ready.",
                        "Tvoj študijný plán je pripravený.",
                      )}
                    </h1>
                    <p>
                      {plan.lessons.length}{" "}
                      {t(
                        "focused lessons. Adjust the order or titles, then begin.",
                        "krátkych lekcií. Uprav poradie alebo názvy a začni.",
                      )}
                    </p>
                    <label>
                      {t("Course title", "Názov kurzu")}
                      <input
                        value={plan.title}
                        onChange={(e) =>
                          setPlan({ ...plan, title: e.target.value })
                        }
                      />
                    </label>
                    <ol className="plan-editor">
                      {plan.lessons.map((item, index) => (
                        <li key={index}>
                          <span>{index + 1}</span>
                          <div>
                            <input
                              aria-label={`${t("Lesson", "Lekcia")} ${index + 1}`}
                              value={item.title}
                              onChange={(e) =>
                                setPlan({
                                  ...plan,
                                  lessons: plan.lessons.map((l, i) =>
                                    i === index
                                      ? { ...l, title: e.target.value }
                                      : l,
                                  ),
                                })
                              }
                            />
                            <p>{item.objective}</p>
                            <small>{item.references.join(", ")}</small>
                          </div>
                          <div className="reorder">
                            <button
                              className="icon-button"
                              aria-label={t("Move up", "Posunúť vyššie")}
                              disabled={!index}
                              onClick={() => {
                                const next = [...plan.lessons];
                                [next[index - 1], next[index]] = [
                                  next[index],
                                  next[index - 1],
                                ];
                                setPlan({ ...plan, lessons: next });
                              }}
                            >
                              <ArrowUp size={14} />
                            </button>
                            <button
                              className="icon-button"
                              aria-label={t("Move down", "Posunúť nižšie")}
                              disabled={index === plan.lessons.length - 1}
                              onClick={() => {
                                const next = [...plan.lessons];
                                [next[index], next[index + 1]] = [
                                  next[index + 1],
                                  next[index],
                                ];
                                setPlan({ ...plan, lessons: next });
                              }}
                            >
                              <ArrowUp
                                size={14}
                                style={{ transform: "rotate(180deg)" }}
                              />
                            </button>
                            <button
                              className="icon-button"
                              aria-label={t(
                                "Remove lesson",
                                "Odstrániť lekciu",
                              )}
                              disabled={plan.lessons.length === 1}
                              onClick={() =>
                                setPlan({
                                  ...plan,
                                  lessons: plan.lessons.filter(
                                    (_, i) => i !== index,
                                  ),
                                })
                              }
                            >
                              <X size={14} />
                            </button>
                          </div>
                        </li>
                      ))}
                    </ol>
                    <button
                      className="primary"
                      disabled={
                        busy ||
                        !plan.title.trim() ||
                        plan.lessons.some((l) => !l.title.trim())
                      }
                      onClick={() =>
                        void run(async () => {
                          const saved = await call<Snapshot>("editPlan", {
                            courseId: data.course!.id,
                            plan,
                          });
                          const snapshot = await call<Snapshot>(
                            "activate",
                            saved.lessons[0].id,
                          );
                          setData(snapshot);
                          await explain(snapshot);
                        })
                      }
                    >
                      {t("Start learning", "Začať štúdium")}
                      <ArrowRight size={16} />
                    </button>
                  </div>
                ) : lesson ? (
                  <>
                    <div className="lesson-heading">
                      <div className="lesson-meta">
                        <span>
                          {t("Lesson", "Lekcia")} {lesson.position + 1} /{" "}
                          {data.lessons.length}
                        </span>
                        <span
                          className={
                            lesson.status === "completed"
                              ? "status-pill completed"
                              : "status-pill"
                          }
                        >
                          {lesson.status === "completed"
                            ? t("Completed", "Dokončená")
                            : lesson.status === "needs_review"
                              ? t("Needs review", "Na zopakovanie")
                              : t("In progress", "Prebieha")}
                        </span>
                      </div>
                      <h1>{lesson.title}</h1>
                      <div className="lesson-subtitle">
                        <span>
                          {lesson.references.join(" · ") ||
                            t(
                              "Based on your material",
                              "Na základe tvojho materiálu",
                            )}
                        </span>
                        <button
                          className="text-button"
                          onClick={() => setOverview(!overview)}
                        >
                          {t("Lesson overview", "Prehľad lekcie")}
                          <ChevronDown size={13} />
                        </button>
                      </div>
                      {overview && (
                        <p className="objective">{lesson.objective}</p>
                      )}
                    </div>
                    <div className="messages" ref={scroller}>
                      <div className="message-width">
                        {data.messages.length === 0 && !busy && (
                          <div className="lesson-start">
                            <Sparkles size={24} />
                            <h2>
                              {t(
                                "Let’s make this concept click.",
                                "Poďme pochopiť tento koncept.",
                              )}
                            </h2>
                            <p>
                              {t(
                                "Start the explanation, then ask anything. We’ll stay on this lesson until you’re ready.",
                                "Spusti vysvetlenie a potom sa pýtaj. Zostaneme pri tejto lekcii, kým nebudeš pripravený.",
                              )}
                            </p>
                            <button
                              className="primary"
                              onClick={() => void run(() => explain(data))}
                            >
                              {t("Explain this lesson", "Vysvetli túto lekciu")}
                            </button>
                          </div>
                        )}
                        {data.messages.map((message) => (
                          <article
                            className={`message ${message.role}`}
                            key={message.id}
                          >
                            <div className="message-author">
                              {message.role === "assistant" ? (
                                <>
                                  <span className="tutor-icon">
                                    <Sparkles size={14} />
                                  </span>
                                  StudyFlow
                                  <span className="muted">
                                    {t("Tutor", "Tútor")}
                                  </span>
                                </>
                              ) : (
                                <>
                                  <span className="user-icon">
                                    {t("Y", "T")}
                                  </span>
                                  {t("You", "Ty")}
                                </>
                              )}
                            </div>
                            <div className="prose">
                              <RichText>{message.content}</RichText>
                            </div>
                            {message.status === "interrupted" && (
                              <small className="warning">
                                {t(
                                  "Response interrupted. Ask again to continue.",
                                  "Odpoveď bola prerušená. Skús sa opýtať znova.",
                                )}
                              </small>
                            )}
                          </article>
                        ))}
                        {busy && (
                          <article className="message assistant">
                            <div className="message-author">
                              <span className="tutor-icon">
                                <Sparkles size={14} />
                              </span>
                              StudyFlow{" "}
                              <LoaderCircle className="spin muted" size={13} />
                            </div>
                            {stream ? (
                              <div className="prose">
                                <RichText>{stream}</RichText>
                              </div>
                            ) : (
                              <p className="muted">
                                {t(
                                  "Thinking about your lesson…",
                                  "Premýšľam nad tvojou lekciou…",
                                )}
                              </p>
                            )}
                          </article>
                        )}
                      </div>
                    </div>
                    <div className="lesson-controls">
                      <div className="controls-width">
                        <div className="quick-actions">
                          {quick.map(
                            ({ icon: Icon, en, sk: slovak, prompt, mode }) => (
                              <button
                                disabled={busy}
                                key={en}
                                onClick={() => chat(prompt, mode)}
                              >
                                <Icon size={13} />
                                {t(en, slovak)}
                              </button>
                            ),
                          )}
                        </div>
                        <div className="next-row">
                          <button
                            className="icon-button"
                            aria-label={t(
                              "Previous lesson",
                              "Predchádzajúca lekcia",
                            )}
                            disabled={busy || lesson.position === 0}
                            onClick={() =>
                              navigate(data.lessons[lesson.position - 1].id)
                            }
                          >
                            <ArrowLeft size={17} />
                          </button>
                          <button
                            className="text-button review-button"
                            disabled={busy}
                            onClick={() =>
                              void run(async () =>
                                setData(
                                  await call<Snapshot>("mark", {
                                    lessonId: lesson.id,
                                    status:
                                      lesson.status === "completed"
                                        ? "in_progress"
                                        : "needs_review",
                                  }),
                                ),
                              )
                            }
                          >
                            {lesson.status === "completed"
                              ? t("Mark incomplete", "Označiť ako nedokončenú")
                              : t("Needs review", "Zopakovať neskôr")}
                          </button>
                          <button
                            className="next-button"
                            disabled={busy}
                            onClick={complete}
                          >
                            {t(
                              "I understand, next lesson",
                              "Rozumiem, ďalšia lekcia",
                            )}
                            <ArrowRight size={16} />
                          </button>
                        </div>
                        {undo && (
                          <div className="undo">
                            {t("Lesson completed.", "Lekcia dokončená.")}{" "}
                            <button
                              disabled={busy}
                              onClick={() =>
                                void run(async () => {
                                  setData(await call<Snapshot>("undo", undo));
                                  setUndo("");
                                })
                              }
                            >
                              <RotateCcw size={12} />
                              {t("Undo", "Späť")}
                            </button>
                          </div>
                        )}
                        <form
                          className="composer"
                          onSubmit={(e) => {
                            e.preventDefault();
                            chat(draft);
                          }}
                        >
                          <textarea
                            aria-label={t(
                              "Ask about this lesson",
                              "Opýtaj sa na túto lekciu",
                            )}
                            placeholder={t(
                              "Ask a question about this lesson…",
                              "Opýtaj sa na túto lekciu…",
                            )}
                            rows={2}
                            value={draft}
                            maxLength={12000}
                            onChange={(e) => setDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                if (!busy) chat(draft);
                              }
                            }}
                          />
                          <div className="composer-bottom">
                            <span>
                              <Sparkles size={12} />
                              {connection.models.find(
                                (m) => m.slug === data.settings.model,
                              )?.display_name ??
                                t("ChatGPT tutor", "ChatGPT tútor")}
                            </span>
                            <div className="row">
                              {data.settings[`exercise:${lesson.id}`] && (
                                <button
                                  type="button"
                                  className="text-button"
                                  disabled={busy || !draft.trim()}
                                  onClick={() => chat(draft, "answer")}
                                >
                                  {t("Submit exercise", "Odovzdať cvičenie")}
                                </button>
                              )}
                              {busy ? (
                                <button
                                  type="button"
                                  className="send"
                                  aria-label={t(
                                    "Stop response",
                                    "Zastaviť odpoveď",
                                  )}
                                  onClick={() => void call("cancel")}
                                >
                                  <Square size={13} />
                                </button>
                              ) : (
                                <button
                                  type="submit"
                                  className="send"
                                  disabled={!draft.trim()}
                                  aria-label={t(
                                    "Send question",
                                    "Odoslať otázku",
                                  )}
                                >
                                  <ArrowUp size={16} />
                                </button>
                              )}
                            </div>
                          </div>
                        </form>
                        <div className="composer-hint">
                          {t(
                            "Your questions stay in this lesson. Move on when you’re ready.",
                            "Tvoje otázky zostávajú v tejto lekcii. Pokračuj, keď budeš pripravený.",
                          )}
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="page completion">
                    <div className="completion-icon">
                      <Check size={32} />
                    </div>
                    <h1>
                      {t(
                        "Course complete. Nicely done.",
                        "Kurz dokončený. Výborne.",
                      )}
                    </h1>
                    <p>
                      {data.course.completed}/{data.course.total}{" "}
                      {t(
                        "lessons completed. Every conversation is saved for whenever you need it.",
                        "lekcií dokončených. Všetky konverzácie sú uložené a môžeš sa k nim vrátiť.",
                      )}
                    </p>
                    <ul>
                      {data.lessons.map((l) => (
                        <li key={l.id}>
                          <Check size={15} />
                          <button
                            disabled={busy}
                            onClick={() => navigate(l.id)}
                          >
                            {l.title}
                          </button>
                        </li>
                      ))}
                    </ul>
                    {undo && (
                      <button
                        className="secondary"
                        onClick={() =>
                          void run(async () => {
                            setData(await call<Snapshot>("undo", undo));
                            setUndo("");
                          })
                        }
                      >
                        <RotateCcw size={14} />
                        {t(
                          "Undo last completion",
                          "Vrátiť posledné dokončenie",
                        )}
                      </button>
                    )}
                  </div>
                )}
              </div>
              {pathVisible && (
                <aside className="path-panel">
                  <div className="path-title">
                    <List size={16} />
                    <h2>{t("Learning path", "Študijný plán")}</h2>
                    <span>{data.lessons.length}</span>
                  </div>
                  <div className="path-progress">
                    <div>
                      <span>
                        {data.course.completed}/{data.course.total}{" "}
                        {t("completed", "dokončených")}
                      </span>
                      <strong>{progress}%</strong>
                    </div>
                    <div className="progress-track">
                      <span style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                  <ol className="lesson-list">
                    {data.lessons.map((item) => (
                      <li key={item.id}>
                        <button
                          disabled={busy || !data.course?.started}
                          className={`${item.id === activeId ? "current" : ""} ${item.status === "completed" ? "done" : ""}`}
                          onClick={() => navigate(item.id)}
                        >
                          <span className="lesson-marker">
                            {item.status === "completed" ? (
                              <Check size={13} />
                            ) : (
                              item.position + 1
                            )}
                          </span>
                          <span>
                            {item.title}
                            <small>
                              {item.status === "completed"
                                ? t("Completed", "Dokončená")
                                : item.status === "needs_review"
                                  ? t("Needs review", "Na zopakovanie")
                                  : item.id === activeId
                                    ? t("Learning now", "Práve študuješ")
                                    : t("Upcoming", "Nasleduje")}
                            </small>
                          </span>
                          {item.id === activeId && (
                            <span className="current-dot" />
                          )}
                        </button>
                      </li>
                    ))}
                  </ol>
                  <div className="source-box">
                    <h3>{t("Source material", "Zdrojový materiál")}</h3>
                    {data.sources.map((source) => (
                      <div key={source.id}>
                        <button
                          className="source-name"
                          onClick={() =>
                            void run(async () =>
                              setSource(
                                await call<Material>("source", source.id),
                              ),
                            )
                          }
                        >
                          <FileText size={16} />
                          <span>{source.name}</span>
                        </button>
                        {source.warning && (
                          <details>
                            <summary>
                              {t("Import details", "Podrobnosti importu")}
                            </summary>
                            <p>{source.warning}</p>
                          </details>
                        )}
                      </div>
                    ))}
                    <p className="local-note">
                      {t(
                        "Progress is saved automatically on this computer.",
                        "Pokrok sa automaticky ukladá v tomto počítači.",
                      )}
                    </p>
                  </div>
                </aside>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
