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
  PanelLeft,
  ArrowDown,
  Globe,
  ListChecks,
} from "lucide-react";
import type {
  Snapshot,
  Plan,
  Material,
  NormalSnapshot,
  NormalAttachment,
} from "../src/domain";
import "katex/dist/katex.min.css";
import "./style.css";
import { PathCompletionDialog } from "./PathCompletionDialog";
import { ConversationDialog } from "./ConversationDialog";
import { localizeMessage } from "../src/localization";
import { attachmentsSchema } from "../src/domain";
import { useChatScroll } from "./useChatScroll";
import { QuizDialog } from "./QuizDialog";
import { mathMarkdown } from "../src/markdown";
import { isQuizRequest, quizScope, type QuizTarget } from "../src/quiz";

type Connection = {
  error?: string;
  connected: boolean;
  planEnabled: boolean;
  account: string;
  models: { slug: string; display_name: string }[];
};
type Event = {
  kind: string;
  text: string;
  lessonId?: string;
  conversationId?: string;
};
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
    if (action === "normalSnapshot")
      return {
        conversations: [],
        conversation: null,
        messages: [],
        settings: empty.settings,
      } as T;
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
const RichText = React.memo(function RichText({
  children,
}: {
  children: string;
}) {
  const [linkError, setLinkError] = useState("");
  return (
    <>
      <Markdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, rehypeHighlight]}
        components={{
          a: ({ children, href }) =>
            href && /^https?:\/\//i.test(href) ? (
              <a
                className="source-link"
                href={href}
                target="_blank"
                rel="noreferrer noopener"
                onClick={(event) => {
                  event.preventDefault();
                  void call("openLink", href).catch((error) =>
                    setLinkError(error.message),
                  );
                }}
              >
                {children}
              </a>
            ) : (
              <span>{children}</span>
            ),
          img: ({ alt }) => <span>{alt}</span>,
        }}
      >
        {mathMarkdown(children)}
      </Markdown>
      {linkError && <small role="alert">{linkError}</small>}
    </>
  );
});
function WebSearchToggle({
  enabled,
  onChange,
  disabled,
  sk,
}: {
  enabled: boolean;
  onChange: () => void;
  disabled: boolean;
  sk: boolean;
}) {
  return (
    <button
      type="button"
      className={`text-button web-toggle ${enabled ? "enabled" : ""}`}
      aria-pressed={enabled}
      disabled={disabled}
      onClick={onChange}
      title={
        sk
          ? "Výskum je automatický podľa potreby. Zapni pre dôkladnejšie overovanie z viacerých zdrojov. Dostupnosť závisí od modelu a účtu."
          : "Research is automatic when useful. Enable for deeper verification across sources. Availability depends on your model and account."
      }
    >
      <Globe size={14} />
      {sk ? "Hĺbkový výskum" : "Deep research"}
    </button>
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
      <p>{localizeMessage(material.warning, sk ? "sk" : "en")}</p>
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
  const [normal, setNormal] = useState<NormalSnapshot>({
    conversations: [],
    conversation: null,
    messages: [],
    settings: empty.settings,
  });
  const [normalDraft, setNormalDraft] = useState("");
  const [normalAttachments, setNormalAttachments] = useState<
    NormalAttachment[]
  >([]);
  const [normalStream, setNormalStream] = useState("");
  const [responding, setResponding] = useState(false);
  const [studyResponding, setStudyResponding] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [manageChat, setManageChat] = useState<{
    id: string;
    title: string;
    action: "rename" | "delete";
  } | null>(null);
  const [connection, setConnection] = useState<Connection>({
    connected: false,
    models: [],
    account: "",
    planEnabled: false,
  });
  const [view, setView] = useState<
    "home" | "learn" | "new" | "settings" | "normal"
  >("home");
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
  const [pathConfirmation, setPathConfirmation] = useState(false);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [pathUndo, setPathUndo] = useState<{
    courseId: string;
    operationId: string;
  } | null>(null);
  const [pathVisible, setPathVisible] = useState(true);
  const [overview, setOverview] = useState(false);
  const activeId = data.course?.activeLessonId;
  const lesson = data.lessons.find((l) => l.id === activeId);
  const activeRef = useRef(activeId);
  activeRef.current = activeId;
  const normalRef = useRef<string | undefined>(undefined);
  normalRef.current = normal.conversation?.id;
  const [plan, setPlan] = useState<Plan | null>(null);
  const [studyFocus, setStudyFocus] = useState("");
  const [scopeFrom, setScopeFrom] = useState("");
  const [scopeTo, setScopeTo] = useState("");
  const [searchWeb, setSearchWeb] = useState(false);
  const [quizDialog, setQuizDialog] = useState<{
    target: QuizTarget;
    request: string;
    attachments?: NormalAttachment[];
  } | null>(null);
  const studyScope = {
    instructions: studyFocus.trim(),
    ...(scopeFrom ? { from: Number(scopeFrom) } : {}),
    ...(scopeTo ? { to: Number(scopeTo) } : {}),
  };
  const savedDocuments = [
    ...new Map(
      normal.messages
        .flatMap((message) => message.attachments)
        .map((file) => [file.name, file]),
    ).values(),
  ];
  const [source, setSource] = useState<Material | null>(null);
  const sk = data.settings.language === "sk";
  const t = (en: string, slovak: string) => (sk ? slovak : en);
  const progress = data.course?.total
    ? Math.round((data.course.completed / data.course.total) * 100)
    : 0;
  const chatScroll = useChatScroll(
    `${view}:${view === "normal" ? normal.conversation?.id : activeId}`,
    `${data.messages.length}:${normal.messages.length}:${stream}:${normalStream}`,
    view === "normal",
  );
  const scroller = chatScroll.ref;
  const latestButton = chatScroll.away && (
    <button className="latest-message" onClick={() => chatScroll.latest()}>
      <ArrowDown size={15} />
      {t("Latest message", "Najnovšia správa")}
    </button>
  );

  useEffect(() => {
    let mounted = true;
    Promise.all([
      call<Snapshot>("snapshot"),
      call<NormalSnapshot>("normalSnapshot"),
      call<Connection>("status"),
    ])
      .then(([snapshot, normalSnapshot, status]) => {
        if (!mounted) return;
        setData(snapshot);
        setNormal(normalSnapshot);
        setConnection(status);
        if (status.error) setError(status.error);
        if (snapshot.settings.activeMode === "normal") {
          setView("normal");
        } else if (snapshot.course) setView("learn");
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
      if (event.kind === "zoom") setZoom(Number(event.text));
      if (event.kind === "error") setError(event.text);
      if (
        event.kind === "delta" &&
        event.lessonId &&
        event.lessonId === activeRef.current
      )
        setStream((text) => text + event.text);
      if (
        event.kind === "delta" &&
        event.conversationId &&
        event.conversationId === normalRef.current
      )
        setNormalStream((text) => text + event.text);
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
  }, [activeId]);
  useEffect(() => {
    setZoom(Number(data.settings.zoomFactor) || 1);
  }, [data.settings.zoomFactor]);
  useEffect(() => {
    setNavigationOpen(false);
  }, [view, data.course?.id, normal.conversation?.id]);
  useEffect(() => {
    const narrow = matchMedia("(max-width: 850px)");
    const adapt = () => setPathVisible(!narrow.matches);
    adapt();
    narrow.addEventListener("change", adapt);
    return () => narrow.removeEventListener("change", adapt);
  }, []);
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
    setStudyResponding(true);
    try {
      setData(
        await call<Snapshot>("chat", {
          lessonId: id,
          question: "",
          mode: "chat",
        }),
      );
    } finally {
      setStudyResponding(false);
      setStream("");
    }
  }
  async function switchMode(mode: "normal" | "study") {
    if (busy) return;
    await run(async () => {
      const result = await call<Snapshot | NormalSnapshot>("activeMode", mode);
      if (mode === "normal") {
        let next = result as NormalSnapshot;
        if (!next.conversation)
          next = await call<NormalSnapshot>("normalCreate", null);
        setNormal(next);
        setView("normal");
      } else {
        const snapshot = result as Snapshot;
        setData(snapshot);
        setView(snapshot.course ? "learn" : "home");
      }
    });
  }
  function showStudy(target: "home" | "new" | "learn") {
    void run(async () => {
      setData(await call<Snapshot>("activeMode", "study"));
      setView(target);
    });
  }
  async function createNormalConversation() {
    await run(async () => {
      setNormal(await call<NormalSnapshot>("normalCreate", null));
      setNormalDraft("");
      setNormalAttachments([]);
      setNormalStream("");
      setView("normal");
    });
  }
  async function sendNormal() {
    if (busy || (!normalDraft.trim() && !normalAttachments.length)) return;
    if (isQuizRequest(normalDraft)) {
      await openQuiz(normalDraft);
      return;
    }
    const current = normal.conversation;
    await run(async () => {
      const validation = attachmentsSchema.safeParse(normalAttachments);
      if (!validation.success)
        throw new Error(
          normalAttachments.length > 8
            ? "Attach at most 8 files per message."
            : "Attachments are too large to send together. Remove some images or attach a smaller file.",
        );
      let target = current;
      if (!target) {
        const created = await call<NormalSnapshot>("normalCreate", null);
        setNormal(created);
        target = created.conversation;
      }
      if (!target) return;
      setResponding(true);
      chatScroll.latest(false);
      const messageText = normalDraft.trim();
      normalRef.current = target.id;
      setNormal((value) => ({
        ...value,
        conversation: target!,
        messages: [
          ...value.messages,
          {
            id: crypto.randomUUID(),
            conversationId: target!.id,
            role: "user",
            content: messageText,
            status: "complete",
            createdAt: new Date().toISOString(),
            attachments: normalAttachments,
          },
        ],
      }));
      setNormalDraft("");
      setNormalStream("");
      const attachments = normalAttachments;
      setNormalAttachments([]);
      try {
        setNormal(
          await call<NormalSnapshot>("normalChat", {
            id: target.id,
            question: messageText,
            attachments,
            webSearch: searchWeb,
          }),
        );
      } finally {
        setResponding(false);
        setNormalStream("");
        setNormal(await call<NormalSnapshot>("normalSnapshot", target.id));
      }
    });
  }
  function navigate(id: string) {
    if (matchMedia("(max-width: 850px)").matches) setPathVisible(false);
    void run(async () => {
      await call("activeMode", "study");
      const snapshot = await call<Snapshot>("activate", id);
      setData(snapshot);
      setView("learn");
      await explain(snapshot);
    });
  }
  function openCourse(id: string) {
    void run(async () => {
      await call("activeMode", "study");
      const snapshot = await call<Snapshot>("snapshot", id);
      setData(snapshot);
      setView("learn");
    });
  }
  function chat(question: string, mode = "chat") {
    if (!activeId || !question.trim()) return;
    if (mode === "exercise" || (mode === "chat" && isQuizRequest(question))) {
      void openQuiz(mode === "exercise" ? "" : question);
      return;
    }
    void run(async () => {
      const id = activeId;
      setStudyResponding(true);
      chatScroll.latest(false);
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
        setData(
          await call<Snapshot>("chat", {
            lessonId: id,
            question,
            mode,
            webSearch: searchWeb,
          }),
        );
      } finally {
        setStudyResponding(false);
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
  async function openQuiz(request = "") {
    if (busy) return;
    if (view === "normal") {
      await run(async () => {
        let conversation = normal.conversation;
        if (!conversation) {
          const created = await call<NormalSnapshot>("normalCreate", null);
          setNormal(created);
          conversation = created.conversation;
        }
        if (conversation)
          setQuizDialog({
            target: { conversationId: conversation.id, scope: "chat" },
            request,
            attachments: normalAttachments,
          });
      });
    } else if (activeId)
      setQuizDialog({
        target: { lessonId: activeId, scope: quizScope(request) },
        request,
      });
  }
  function importFile() {
    void run(async () => {
      const snapshot = await call<Snapshot | null>("import", studyScope);
      if (snapshot) {
        setData(snapshot);
        setView("learn");
      }
    });
  }
  function adjustZoom(action: "in" | "out" | "reset") {
    void call<number>("zoom", action)
      .then(setZoom)
      .catch((error) => setError(error.message));
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
      setNormal(await call<NormalSnapshot>("normalSnapshot"));
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
  const languageControl = (
    <label className="lesson-language">
      {t("AI response language", "Jazyk odpovedí AI")}
      <select
        value={data.course?.aiLanguage ?? "default"}
        disabled={busy}
        onChange={(e) =>
          void run(async () =>
            setData(
              await call<Snapshot>("courseLanguage", {
                courseId: data.course!.id,
                language: e.target.value === "default" ? null : e.target.value,
              }),
            ),
          )
        }
      >
        <option value="default">
          {t("Use default", "Použiť predvolený")} (
          {data.settings.tutorLanguage === "sk" ? "Slovenčina" : "English"})
        </option>
        <option value="sk">Slovenčina</option>
        <option value="en">English</option>
      </select>
    </label>
  );
  return (
    <div
      className={`app-shell ${view === "learn" ? "study-shell" : ""} ${navigationOpen ? "navigation-open" : ""}`}
    >
      {navigationOpen && (
        <button
          className="navigation-backdrop"
          aria-label={t("Close navigation", "Zavrieť navigáciu")}
          onClick={() => setNavigationOpen(false)}
        />
      )}
      {pathConfirmation && data.course && (
        <PathCompletionDialog
          title={data.course.title}
          count={data.lessons.length}
          sk={sk}
          busy={busy}
          close={() => setPathConfirmation(false)}
          confirm={() =>
            void run(async () => {
              const courseId = data.course!.id;
              const operationId = crypto.randomUUID();
              setData(
                await call<Snapshot>("completePath", { courseId, operationId }),
              );
              setUndo("");
              setPathUndo({ courseId, operationId });
              setPathConfirmation(false);
            })
          }
        />
      )}
      {manageChat && (
        <ConversationDialog
          key={manageChat.id + manageChat.action}
          {...manageChat}
          sk={sk}
          onClose={() => setManageChat(null)}
          onConfirm={async (title) => {
            const result = await call<NormalSnapshot>(
              manageChat.action === "rename" ? "normalRename" : "normalDelete",
              manageChat.action === "rename"
                ? { id: manageChat.id, title }
                : manageChat.id,
            );
            if (
              manageChat.action === "delete" &&
              manageChat.id === normal.conversation?.id
            ) {
              setNormalDraft("");
              setNormalAttachments([]);
              setNormalStream("");
            }
            setNormal(result);
            setManageChat(null);
          }}
        />
      )}
      {quizDialog && (
        <QuizDialog
          target={quizDialog.target}
          initialRequest={quizDialog.request}
          contextTitle={
            "lessonId" in quizDialog.target
              ? data.lessons.find(
                  (l) =>
                    l.id ===
                    (quizDialog.target as { lessonId: string }).lessonId,
                )?.title
              : normal.conversation?.title
          }
          attachments={quizDialog.attachments}
          sk={sk}
          command={call}
          renderText={(text) => <RichText>{text}</RichText>}
          onClose={() => setQuizDialog(null)}
          onChanged={async () => {
            if ("conversationId" in quizDialog.target) {
              setNormal(
                await call<NormalSnapshot>(
                  "normalSnapshot",
                  quizDialog.target.conversationId,
                ),
              );
              setNormalDraft("");
              setNormalAttachments([]);
            } else setDraft("");
          }}
        />
      )}
      {source && (
        <SourceDialog material={source} close={() => setSource(null)} sk={sk} />
      )}
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-icon">
            <GraduationCap size={20} />
          </span>
          <strong>StudyFlow</strong>
          <span className="local-badge">{t("local", "lokálne")}</span>
        </div>
        <button
          className="new-button"
          disabled={busy}
          onClick={() =>
            view === "normal"
              ? void createNormalConversation()
              : showStudy("new")
          }
        >
          <Plus size={16} />
          {view === "normal"
            ? t("New chat", "Nový chat")
            : t("New learning session", "Nové štúdium")}
          <kbd>+</kbd>
        </button>
        <nav aria-label={t("Main navigation", "Hlavná navigácia")}>
          <button
            className={view === "home" ? "nav active" : "nav"}
            disabled={busy}
            onClick={() => showStudy("home")}
          >
            <LayoutDashboard size={16} />
            {t("Overview", "Prehľad")}
          </button>
          <button
            className={view === "learn" ? "nav active" : "nav"}
            disabled={busy || !data.course}
            onClick={() => showStudy("learn")}
          >
            <MessageSquare size={16} />
            {t("Learning workspace", "Pracovný priestor")}
          </button>
        </nav>
        <div className="mode-switch">
          <button
            className={
              view === "normal" ? "mode-option selected" : "mode-option"
            }
            disabled={busy}
            onClick={() => void switchMode("normal")}
          >
            <MessageSquare size={14} />
            {t("Normal chat", "Bežný chat")}
          </button>
          <button
            className={
              view === "learn" || view === "new"
                ? "mode-option selected"
                : "mode-option"
            }
            disabled={busy}
            onClick={() => void switchMode("study")}
          >
            <GraduationCap size={14} />
            {t("Study mode", "Študijný režim")}
          </button>
        </div>
        {view === "normal" && (
          <>
            <div className="sidebar-heading">
              {t("Conversations", "Konverzácie")}
              <button
                className="icon-button"
                aria-label={t("New chat", "Nový chat")}
                onClick={() => void createNormalConversation()}
              >
                <Plus size={14} />
              </button>
            </div>
            <div className="course-list chat-list">
              {normal.conversations.map((conversation) => (
                <div
                  className={`chat-nav ${normal.conversation?.id === conversation.id ? "selected" : ""}`}
                  key={conversation.id}
                >
                  <button
                    className="chat-select"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        setNormal(
                          await call<NormalSnapshot>(
                            "normalSelect",
                            conversation.id,
                          ),
                        );
                        setNormalDraft("");
                        setNormalAttachments([]);
                        setNormalStream("");
                      })
                    }
                  >
                    <MessageSquare size={14} />
                    <span>
                      {conversation.title === "New conversation" &&
                      !conversation.messageCount
                        ? t("New conversation", "Nová konverzácia")
                        : conversation.title}
                      <small>
                        {conversation.preview.slice(0, 60) ||
                          t("New conversation", "Nová konverzácia")}
                      </small>
                    </span>
                  </button>
                  <button
                    className="icon-button chat-menu"
                    title={t("Rename", "Premenovať")}
                    aria-label={t(
                      "Rename conversation",
                      "Premenovať konverzáciu",
                    )}
                    disabled={busy}
                    onClick={() =>
                      setManageChat({
                        id: conversation.id,
                        title: conversation.title,
                        action: "rename",
                      })
                    }
                  >
                    <MoreHorizontal size={15} />
                  </button>
                  <button
                    className="icon-button chat-menu"
                    title={t("Delete", "Odstrániť")}
                    aria-label={t(
                      "Delete conversation",
                      "Odstrániť konverzáciu",
                    )}
                    disabled={busy}
                    onClick={() =>
                      setManageChat({
                        id: conversation.id,
                        title: conversation.title,
                        action: "delete",
                      })
                    }
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
              {!normal.conversations.length && (
                <p className="sidebar-empty">
                  {t(
                    "Your chats will appear here.",
                    "Tu sa zobrazia tvoje chaty.",
                  )}
                </p>
              )}
            </div>
          </>
        )}
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
                <span
                  className={`course-icon ${course.completed === course.total ? "green" : ""}`}
                >
                  {course.completed === course.total ? (
                    <Check size={15} />
                  ) : (
                    <BookOpen size={15} />
                  )}
                </span>
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
          {
            <button
              className="icon-button study-navigation-toggle"
              aria-label={t("Toggle navigation", "Prepnúť navigáciu")}
              aria-expanded={navigationOpen}
              onClick={() => setNavigationOpen(!navigationOpen)}
            >
              <PanelLeft size={18} />
            </button>
          }
          <div className="breadcrumb">
            <BookOpen size={15} />
            <span>
              {view === "normal"
                ? t("Normal chat", "Bežný chat")
                : view === "learn"
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
            <div
              className="zoom-controls"
              aria-label={t("Zoom controls", "Zväčšenie rozhrania")}
            >
              <button
                title={t("Zoom out (Ctrl −)", "Zmenšiť (Ctrl −)")}
                aria-label={t("Zoom out", "Zmenšiť")}
                disabled={zoom <= 0.65}
                onClick={() => adjustZoom("out")}
              >
                −
              </button>
              <button
                className="zoom-reset"
                title={t("Reset zoom (Ctrl 0)", "Obnoviť veľkosť (Ctrl 0)")}
                onClick={() => adjustZoom("reset")}
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                title={t(
                  "Zoom in (Ctrl + / Ctrl =)",
                  "Zväčšiť (Ctrl + / Ctrl =) ",
                )}
                aria-label={t("Zoom in", "Zväčšiť")}
                disabled={zoom >= 2}
                onClick={() => adjustZoom("in")}
              >
                +
              </button>
            </div>
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
            <span>{localizeMessage(error, data.settings.language)}</span>
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
            {localizeMessage(notice, data.settings.language)}
          </div>
        )}
        <main
          className={`main-content ${view === "learn" ? "study-content" : ""}`}
        >
          {view === "normal" && (
            <section className="normal-chat-page">
              <header className="normal-chat-heading">
                <div>
                  <span className="eyebrow">
                    <Sparkles size={14} />
                    {t("GENERAL ASSISTANT", "VŠEOBECNÝ ASISTENT")}
                  </span>
                  <h1>
                    {!normal.conversation ||
                    (normal.conversation.title === "New conversation" &&
                      !normal.conversation.messageCount)
                      ? t("New conversation", "Nová konverzácia")
                      : normal.conversation.title}
                  </h1>
                  <p>
                    {t(
                      "Ask anything. Files are optional; this chat stays separate from your courses.",
                      "Opýtaj sa na čokoľvek. Súbory sú voliteľné a tento chat nemení tvoje kurzy.",
                    )}
                  </p>
                </div>
                <label className="language-inline">
                  {t("AI replies", "Jazyk odpovedí AI")}
                  <select
                    value={normal.conversation?.aiLanguage ?? "default"}
                    disabled={!normal.conversation || busy}
                    onChange={(e) =>
                      void run(async () =>
                        setNormal(
                          await call<NormalSnapshot>("normalLanguage", {
                            id: normal.conversation!.id,
                            language:
                              e.target.value === "default"
                                ? null
                                : e.target.value,
                          }),
                        ),
                      )
                    }
                  >
                    <option value="default">
                      {t("Default", "Predvolený")} (
                      {data.settings.tutorLanguage === "sk"
                        ? "Slovenčina"
                        : "English"}
                      )
                    </option>
                    <option value="sk">Slovenčina</option>
                    <option value="en">English</option>
                  </select>
                </label>
              </header>
              {savedDocuments.length > 0 && (
                <details className="conversation-documents">
                  <summary>
                    <FileText size={14} />
                    {t(
                      "Documents in this chat",
                      "Dokumenty v tomto chate",
                    )} · {savedDocuments.length}
                  </summary>
                  <div className="attachment-list">
                    {savedDocuments.map((file, index) => (
                      <button
                        type="button"
                        className="attachment-chip"
                        key={index}
                        onClick={() =>
                          setSource({
                            ...file,
                            id: `saved-${index}`,
                            warning: file.warning ?? "",
                          })
                        }
                      >
                        <FileText size={14} />
                        {file.name}
                      </button>
                    ))}
                  </div>
                  <small>
                    {t(
                      "Ask about these documents at any time, including a specific page, slide or topic. No lessons are created.",
                      "K týmto dokumentom sa môžeš kedykoľvek vrátiť otázkou na stranu, snímku alebo tému. Nevytvárajú sa lekcie.",
                    )}
                  </small>
                </details>
              )}
              <div
                className="normal-messages"
                ref={scroller}
                onScroll={chatScroll.onScroll}
              >
                {!normal.messages.length && !busy && (
                  <div className="normal-empty">
                    <span>
                      <Sparkles size={24} />
                    </span>
                    <h2>
                      {t(
                        "What would you like to understand?",
                        "Čomu by si chcel porozumieť?",
                      )}
                    </h2>
                    <p>
                      {t(
                        "Start with a question, or attach notes, a PDF, presentation, or image.",
                        "Začni otázkou alebo prilož poznámky, PDF, prezentáciu či obrázok.",
                      )}
                    </p>
                  </div>
                )}
                {normal.messages.map((message) => (
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
                          StudyFlow{" "}
                          <span className="muted">
                            {t("Assistant", "Asistent")}
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="user-icon">{t("Y", "T")}</span>
                          {t("You", "Ty")}
                        </>
                      )}
                    </div>
                    {message.attachments.map((attachment, i) => (
                      <button
                        className="attachment-chip"
                        key={`${message.id}-${i}`}
                        onClick={() =>
                          setSource({
                            ...attachment,
                            id: `${message.id}-${i}`,
                            warning: attachment.warning ?? "",
                          })
                        }
                      >
                        <FileText size={14} />
                        {attachment.name}
                      </button>
                    ))}
                    {message.content && (
                      <div className="prose">
                        <RichText>{message.content}</RichText>
                      </div>
                    )}
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
                {responding && view === "normal" && (
                  <article className="message assistant">
                    <div className="message-author">
                      <span className="tutor-icon">
                        <Sparkles size={14} />
                      </span>
                      StudyFlow{" "}
                      <LoaderCircle className="spin muted" size={13} />
                    </div>
                    {normalStream ? (
                      <div className="prose">
                        <RichText>{normalStream}</RichText>
                      </div>
                    ) : (
                      <p className="muted">{t("Thinking…", "Premýšľam…")}</p>
                    )}
                  </article>
                )}
              </div>
              {latestButton}
              <form
                className="normal-composer"
                onSubmit={(e) => {
                  e.preventDefault();
                  void sendNormal();
                }}
              >
                {normalAttachments.length > 0 && (
                  <div className="attachment-list">
                    {normalAttachments.map((file, i) => (
                      <span
                        className="attachment-chip"
                        key={`${file.name}-${i}`}
                      >
                        <FileText size={14} />
                        {file.name}
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={t(
                            "Remove attachment",
                            "Odstrániť prílohu",
                          )}
                          onClick={() =>
                            setNormalAttachments((all) =>
                              all.filter((_, index) => index !== i),
                            )
                          }
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                {normalAttachments.some((file) => file.warning) && (
                  <details className="attachment-warnings">
                    <summary>
                      {t(
                        "Attachment import details",
                        "Podrobnosti importu príloh",
                      )}
                    </summary>
                    {normalAttachments
                      .filter((file) => file.warning)
                      .map((file, index) => (
                        <p key={index}>
                          <strong>{file.name}: </strong>
                          {localizeMessage(
                            file.warning!,
                            data.settings.language,
                          )}
                        </p>
                      ))}
                  </details>
                )}
                <textarea
                  aria-label={t("Message", "Správa")}
                  placeholder={t("Ask anything…", "Opýtaj sa na čokoľvek…")}
                  rows={3}
                  maxLength={12000}
                  value={normalDraft}
                  onChange={(e) => setNormalDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      !e.shiftKey &&
                      !e.nativeEvent.isComposing
                    ) {
                      e.preventDefault();
                      void sendNormal();
                    }
                  }}
                />
                <div className="normal-composer-bottom">
                  <div className="row">
                    <button
                      type="button"
                      className="text-button"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          const added =
                            await call<NormalAttachment[]>("normalAttach");
                          const next = [...normalAttachments, ...added];
                          if (next.length > 8)
                            throw new Error(
                              "Attach at most 8 files per message.",
                            );
                          if (!attachmentsSchema.safeParse(next).success)
                            throw new Error(
                              "Attachments are too large to send together. Remove some images or attach a smaller file.",
                            );
                          setNormalAttachments(next);
                        })
                      }
                    >
                      <Plus size={15} />
                      {t("Attach", "Priložiť")}
                    </button>
                    <WebSearchToggle
                      enabled={searchWeb}
                      onChange={() => setSearchWeb((value) => !value)}
                      disabled={busy}
                      sk={sk}
                    />
                    <button
                      type="button"
                      className="text-button"
                      disabled={busy}
                      onClick={() => void openQuiz()}
                    >
                      <ListChecks size={14} />
                      {t("Quiz", "Kvíz")}
                    </button>
                    <span className="muted">
                      <Sparkles size={12} />{" "}
                      {connection.models.find(
                        (m) => m.slug === data.settings.model,
                      )?.display_name ?? t("ChatGPT", "ChatGPT")}
                    </span>
                  </div>
                  {busy ? (
                    <button
                      type="button"
                      className="send"
                      aria-label={t("Stop response", "Zastaviť odpoveď")}
                      onClick={() => void call("cancel")}
                    >
                      <Square size={13} />
                    </button>
                  ) : (
                    <button
                      type="submit"
                      className="send"
                      disabled={
                        !normalDraft.trim() && !normalAttachments.length
                      }
                      aria-label={t("Send message", "Odoslať správu")}
                    >
                      <ArrowUp size={16} />
                    </button>
                  )}
                </div>
              </form>
              <p className="normal-footnote">
                {t(
                  "Conversations save automatically on this computer.",
                  "Konverzácie sa automaticky ukladajú v tomto počítači.",
                )}
              </p>
            </section>
          )}
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
                  onClick={() => showStudy("new")}
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
                      className={`course-card ${course.completed === course.total ? "course-complete" : ""}`}
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
                        {course.total > 0 && course.completed === course.total
                          ? t(
                              "Completed · Review course",
                              "Dokončený · Prezrieť kurz",
                            )
                          : course.started
                            ? t("Continue learning", "Pokračovať v štúdiu")
                            : t(
                                "Review learning path",
                                "Prezrieť študijný plán",
                              )}
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
                  <button className="primary" onClick={() => showStudy("new")}>
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
              <div className="study-scope">
                <label htmlFor="study-focus">
                  {t("What would you like to learn?", "Čo sa chceš naučiť?")}
                </label>
                <textarea
                  id="study-focus"
                  rows={2}
                  maxLength={4000}
                  value={studyFocus}
                  onChange={(e) => setStudyFocus(e.target.value)}
                  placeholder={t(
                    "Leave empty for the full learning path, or ask: Teach only polymorphism / Explain the formulas…",
                    "Nechaj prázdne pre celý plán, alebo napíš: Nauč ma iba polymorfizmus / Vysvetli vzorce…",
                  )}
                />
                <details>
                  <summary>
                    {t(
                      "Limit pages or slides (optional)",
                      "Obmedziť strany alebo snímky (voliteľné)",
                    )}
                  </summary>
                  <div className="scope-range">
                    <label>
                      {t("From", "Od")}
                      <input
                        type="number"
                        min={1}
                        max={10000}
                        value={scopeFrom}
                        onChange={(e) => setScopeFrom(e.target.value)}
                      />
                    </label>
                    <label>
                      {t("To", "Do")}
                      <input
                        type="number"
                        min={1}
                        max={10000}
                        value={scopeTo}
                        onChange={(e) => setScopeTo(e.target.value)}
                      />
                    </label>
                  </div>
                </details>
                <small>
                  {t(
                    "Want a summary or document questions instead?",
                    "Chceš radšej súhrn alebo otázky k dokumentu?",
                  )}{" "}
                  <button
                    type="button"
                    className="text-button"
                    disabled={busy}
                    onClick={() => void createNormalConversation()}
                  >
                    {t(
                      "Open normal chat and attach files",
                      "Otvor bežný chat a prilož súbory",
                    )}
                  </button>
                </small>
              </div>
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
                        const snapshot = await call<Snapshot>("url", {
                          url: sourceUrl.trim(),
                          scope: studyScope,
                        });
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
                      scope: studyScope,
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
                    {t("Continue with ChatGPT", "Pokračovať cez ChatGPT")}
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
                {notice && !busy && (
                  <p role="status">
                    {localizeMessage(notice, data.settings.language)}
                  </p>
                )}
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
                  {t(
                    "Default AI response language (both modes)",
                    "Predvolený jazyk odpovedí AI (oba režimy)",
                  )}
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
                {!lesson && (
                  <div className="lesson-toolbar">{languageControl}</div>
                )}
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
                            (
                              saved.lessons.find(
                                (item) => item.status !== "completed",
                              ) ?? saved.lessons[0]
                            ).id,
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
                      <div className="lesson-heading-top">
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
                        {languageControl}
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
                    <div
                      className="messages"
                      ref={scroller}
                      onScroll={chatScroll.onScroll}
                    >
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
                        {data.messages.map((message, index) => (
                          <article
                            className={`message ${message.role} ${index === 0 && message.role === "assistant" ? "initial-explanation" : ""}`}
                            key={message.id}
                          >
                            {index > 0 &&
                              index ===
                                data.messages.findIndex(
                                  (m) => m.role === "user",
                                ) && (
                                <div className="followup-divider">
                                  {t(
                                    "Your questions · same lesson",
                                    "Tvoje otázky · rovnaká lekcia",
                                  )}
                                </div>
                              )}
                            <div className="message-author">
                              {message.role === "assistant" ? (
                                <>
                                  <span className="tutor-icon">
                                    <Sparkles size={14} />
                                  </span>
                                  StudyFlow
                                  <span className="muted">
                                    {index === 0
                                      ? t(
                                          "Lesson explanation",
                                          "Vysvetlenie lekcie",
                                        )
                                      : t("Tutor", "Tútor")}
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
                        {studyResponding && (
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
                    {latestButton}
                    <div className="lesson-controls">
                      <div className="controls-width">
                        <div className="quick-actions">
                          {quick.map(
                            ({ icon: Icon, en, sk: slovak, prompt, mode }) => (
                              <button
                                disabled={busy}
                                key={en}
                                title={prompt}
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
                              if (
                                e.key === "Enter" &&
                                !e.shiftKey &&
                                !e.nativeEvent.isComposing
                              ) {
                                e.preventDefault();
                                if (!busy) chat(draft);
                              }
                            }}
                          />
                          <div className="composer-bottom">
                            <WebSearchToggle
                              enabled={searchWeb}
                              onChange={() => setSearchWeb((value) => !value)}
                              disabled={busy}
                              sk={sk}
                            />
                            <button
                              type="button"
                              className="text-button"
                              disabled={busy}
                              onClick={() => void openQuiz()}
                            >
                              <ListChecks size={14} />
                              {t("Quiz", "Kvíz")}
                            </button>
                            <span className="composer-model">
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
                      {data.course.completed === data.course.total ? (
                        <Check size={32} />
                      ) : (
                        <BookOpen size={32} />
                      )}
                    </div>
                    <h1>
                      {data.course.completed === data.course.total
                        ? t(
                            "Course complete. Nicely done.",
                            "Kurz dokončený. Výborne.",
                          )
                        : t(
                            "Choose a lesson to continue.",
                            "Vyber lekciu a pokračuj.",
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
                          {l.status === "completed" ? (
                            <Check size={15} />
                          ) : (
                            <Circle size={15} />
                          )}
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
                    <details className="path-menu">
                      <summary
                        aria-label={t(
                          "Learning Path actions",
                          "Akcie študijného plánu",
                        )}
                      >
                        <MoreHorizontal size={18} />
                      </summary>
                      <div className="path-menu-items">
                        {progress === 100 ? (
                          <button
                            disabled={busy}
                            onClick={(event) => {
                              event.currentTarget
                                .closest("details")
                                ?.removeAttribute("open");
                              void run(async () => {
                                setData(
                                  await call<Snapshot>("reopenPath", {
                                    courseId: data.course!.id,
                                  }),
                                );
                                setPathUndo(null);
                                setUndo("");
                              });
                            }}
                          >
                            <RotateCcw size={16} />
                            {t(
                              "Reopen Learning Path",
                              "Znovu otvoriť študijný plán",
                            )}
                          </button>
                        ) : (
                          <button
                            disabled={busy}
                            onClick={(event) => {
                              event.currentTarget
                                .closest("details")
                                ?.removeAttribute("open");
                              setPathConfirmation(true);
                            }}
                          >
                            <Check size={16} />
                            {t(
                              "Mark Learning Path as Completed",
                              "Označiť celý Learning Path ako hotový",
                            )}
                          </button>
                        )}
                      </div>
                    </details>
                  </div>
                  {pathUndo?.courseId === data.course.id &&
                    progress === 100 && (
                      <div className="path-undo" role="status">
                        {t(
                          "Learning Path completed.",
                          "Študijný plán dokončený.",
                        )}
                        <button
                          disabled={busy}
                          onClick={() =>
                            void run(async () => {
                              setData(
                                await call<Snapshot>("reopenPath", pathUndo),
                              );
                              setPathUndo(null);
                            })
                          }
                        >
                          <RotateCcw size={14} />
                          {t("Undo", "Späť")}
                        </button>
                      </div>
                    )}
                  <div className="path-progress">
                    <div>
                      <span>
                        {data.course.completed}/{data.course.total}{" "}
                        {t("completed", "dokončených")}
                      </span>
                      <strong>{progress}%</strong>
                    </div>
                    <div
                      className={`progress-track ${progress === 100 ? "is-complete" : ""}`}
                      role="progressbar"
                      aria-label={t("Course progress", "Pokrok v kurze")}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={progress}
                    >
                      <span style={{ width: `${progress}%` }} />
                    </div>
                    <p
                      className={`path-summary ${progress === 100 ? "green" : ""}`}
                      aria-live="polite"
                    >
                      {progress === 100 ? (
                        <>
                          <Check size={14} />
                          {t(
                            "Learning Path completed",
                            "Študijný plán dokončený",
                          )}
                        </>
                      ) : (
                        <>
                          {data.course.total - data.course.completed}{" "}
                          {t("remaining", "zostáva")}
                          {data.lessons.some(
                            (l) => l.status === "needs_review",
                          ) && (
                            <>
                              {" "}
                              ·{" "}
                              {
                                data.lessons.filter(
                                  (l) => l.status === "needs_review",
                                ).length
                              }{" "}
                              {t("to review", "na zopakovanie")}
                            </>
                          )}
                        </>
                      )}
                    </p>
                  </div>
                  <ol className="lesson-list">
                    {data.lessons.map((item) => (
                      <li key={item.id}>
                        <button
                          disabled={busy || !data.course?.started}
                          aria-current={
                            item.id === activeId ? "step" : undefined
                          }
                          className={`lesson-open ${item.id === activeId ? "current" : ""} ${item.status === "completed" ? "done" : ""} ${item.status === "needs_review" ? "needs-review" : ""}`}
                          onClick={() => navigate(item.id)}
                        >
                          <span className="lesson-marker">
                            {item.status === "needs_review" ? (
                              <RotateCcw size={14} />
                            ) : item.status === "completed" ? (
                              <Check size={13} />
                            ) : (
                              item.position + 1
                            )}
                          </span>
                          <span>
                            {item.title}
                            <small>
                              {item.id === activeId && (
                                <span className="current-label">
                                  {t("Current", "Aktuálna")} ·{" "}
                                </span>
                              )}
                              {item.status === "completed"
                                ? t("Completed", "Dokončená")
                                : item.status === "needs_review"
                                  ? t("Needs review", "Na zopakovanie")
                                  : item.id === activeId
                                    ? t("Learning now", "Práve študuješ")
                                    : item.status === "in_progress"
                                      ? t("Started", "Rozpracovaná")
                                      : t("Upcoming", "Nasleduje")}
                            </small>
                          </span>
                          {item.id === activeId && (
                            <span className="current-dot" />
                          )}
                        </button>
                        <button
                          className="lesson-status-action"
                          title={
                            item.status === "completed"
                              ? t(
                                  "Mark as incomplete",
                                  "Označiť ako nedokončené",
                                )
                              : t("Mark as completed", "Označiť ako hotové")
                          }
                          disabled={busy}
                          aria-pressed={item.status === "completed"}
                          aria-label={`${item.status === "completed" ? t("Mark as incomplete", "Označiť ako nedokončené") : t("Mark as completed", "Označiť ako hotové")}: ${item.title}`}
                          onClick={() =>
                            void run(async () => {
                              setData(
                                await call<Snapshot>("mark", {
                                  lessonId: item.id,
                                  status:
                                    item.status === "completed"
                                      ? item.id === activeId
                                        ? "in_progress"
                                        : "not_started"
                                      : "completed",
                                }),
                              );
                              setUndo("");
                              setPathUndo(null);
                            })
                          }
                        >
                          {item.status === "completed" ? (
                            <RotateCcw size={11} />
                          ) : (
                            <Check size={11} />
                          )}
                          <span className="sr-only">
                            {item.status === "completed"
                              ? t(
                                  "Mark as incomplete",
                                  "Označiť ako nedokončené",
                                )
                              : t("Mark as completed", "Označiť ako hotové")}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ol>
                  <details className="source-box">
                    <summary>
                      {t("Source material", "Zdrojový materiál")}
                    </summary>
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
                            <p>
                              {localizeMessage(
                                source.warning,
                                data.settings.language,
                              )}
                            </p>
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
                  </details>
                </aside>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
