import { useEffect, useRef } from "react";

export function PathCompletionDialog({
  title,
  count,
  sk,
  busy,
  close,
  confirm,
}: {
  title: string;
  count: number;
  sk: boolean;
  busy: boolean;
  close: () => void;
  confirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="path-completion-dialog"
      aria-labelledby="path-completion-title"
      onCancel={(event) => {
        if (busy) event.preventDefault();
        else close();
      }}
    >
      <h2 id="path-completion-title">
        {sk
          ? "Dokončiť celý študijný plán?"
          : "Complete the entire Learning Path?"}
      </h2>
      <p>
        <strong>{title}</strong>
      </p>
      <p>
        {sk
          ? `Všetkých ${count} lekcií sa označí ako hotové. Konverzácie a materiály zostanú uložené. Akciu môžeš vrátiť späť.`
          : `All ${count} lessons will be marked as completed. Conversations and materials will be preserved. You can undo this action.`}
      </p>
      <div className="row">
        <button className="secondary" disabled={busy} onClick={close}>
          {sk ? "Zrušiť" : "Cancel"}
        </button>
        <button className="primary" disabled={busy} onClick={confirm}>
          {sk ? "Dokončiť celý plán" : "Complete entire path"}
        </button>
      </div>
    </dialog>
  );
}
