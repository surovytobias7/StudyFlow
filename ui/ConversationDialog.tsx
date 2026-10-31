import { useEffect, useRef, useState } from "react";
import { localizeMessage } from "../src/localization";

export function ConversationDialog({
  action,
  title,
  sk,
  onClose,
  onConfirm,
}: {
  action: "rename" | "delete";
  title: string;
  sk: boolean;
  onClose: () => void;
  onConfirm: (title: string) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(title);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const t = (en: string, slovak: string) => (sk ? slovak : en);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const label =
    action === "rename"
      ? t("Rename conversation", "Premenovať konverzáciu")
      : t("Delete conversation", "Odstrániť konverzáciu");
  return (
    <dialog
      ref={dialog}
      className="conversation-dialog"
      aria-labelledby="conversation-dialog-title"
      onCancel={(event) => {
        if (saving) event.preventDefault();
        else onClose();
      }}
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (saving) return;
          setSaving(true);
          setError("");
          try {
            await onConfirm(name.trim());
          } catch (error) {
            setError(
              localizeMessage(
                error instanceof Error ? error.message : String(error),
                sk ? "sk" : "en",
              ),
            );
          } finally {
            setSaving(false);
          }
        }}
      >
        <h2 id="conversation-dialog-title">{label}</h2>
        {action === "rename" ? (
          <label>
            {t("Conversation name", "Názov konverzácie")}
            <input
              autoFocus
              required
              maxLength={180}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
        ) : (
          <p>
            {t(
              "Delete this conversation and all its messages? This cannot be undone.",
              "Odstrániť túto konverzáciu aj so všetkými správami? Tento krok sa nedá vrátiť späť.",
            )}
            <strong className="dialog-conversation-name">{title}</strong>
          </p>
        )}
        {error && (
          <p role="alert" className="warning">
            {error}
          </p>
        )}
        <div className="row">
          <button
            type="button"
            className="secondary"
            disabled={saving}
            onClick={onClose}
          >
            {t("Cancel", "Zrušiť")}
          </button>
          <button
            type="submit"
            className="primary"
            disabled={saving || (action === "rename" && !name.trim())}
          >
            {saving ? t("Saving…", "Ukladám…") : label}
          </button>
        </div>
      </form>
    </dialog>
  );
}
