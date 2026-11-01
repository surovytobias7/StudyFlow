import type { WebContents } from "electron";

export type ZoomAction = "in" | "out" | "reset";
export function zoomShortcut(input: {
  type: string;
  key: string;
  code?: string;
  control?: boolean;
  alt?: boolean;
  meta?: boolean;
}): ZoomAction | undefined {
  if (input.type !== "keyDown" || !input.control || input.alt || input.meta)
    return;
  if (
    ["+", "=", "Add"].includes(input.key) ||
    ["Equal", "NumpadAdd"].includes(input.code ?? "")
  )
    return "in";
  if (
    ["-", "_", "Subtract"].includes(input.key) ||
    ["Minus", "NumpadSubtract"].includes(input.code ?? "")
  )
    return "out";
  if (input.key === "0" || ["Digit0", "Numpad0"].includes(input.code ?? ""))
    return "reset";
}
export function validZoom(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0.65 && number <= 2 ? number : 1;
}
export function nextZoom(current: number, action: ZoomAction): number {
  return action === "reset"
    ? 1
    : Math.max(
        0.65,
        Math.min(
          2,
          Math.round((current + (action === "in" ? 0.1 : -0.1)) * 100) / 100,
        ),
      );
}
export function installZoom(
  contents: WebContents,
  saved: unknown,
  save: (factor: number) => void,
) {
  let factor = validZoom(saved);
  const apply = () => {
    contents.setZoomFactor(factor);
    contents.send("studyflow:event", { kind: "zoom", text: String(factor) });
  };
  const change = (action: ZoomAction) => {
    const next = nextZoom(factor, action);
    save(next);
    factor = next;
    apply();
    return factor;
  };
  contents.on("did-finish-load", apply);
  contents.on("before-input-event", (event, input) => {
    const action = zoomShortcut(input);
    if (action) {
      event.preventDefault(); // Also prevents the menu accelerator from applying zoom twice.
      try { change(action); } catch {
        contents.send("studyflow:event", { kind: "error", text: "Zoom preference could not be saved." });
      }
    }
  });
  return change;
}
