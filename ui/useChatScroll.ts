import { useLayoutEffect, useRef, useState } from "react";

// Track the reader's intent before content grows, not their distance after a delta.
export function useChatScroll(
  key: string,
  contentVersion: string,
  startAtBottom: boolean,
) {
  const ref = useRef<HTMLDivElement>(null);
  const previousKey = useRef("");
  const following = useRef(false);
  const [away, setAway] = useState(false);
  const distance = () => {
    const el = ref.current;
    return el ? el.scrollHeight - el.scrollTop - el.clientHeight : 0;
  };
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (previousKey.current !== key) {
      previousKey.current = key;
      following.current = startAtBottom;
      el.scrollTop = startAtBottom ? el.scrollHeight : 0;
    } else if (following.current) el.scrollTop = el.scrollHeight;
    setAway(distance() > 80);
  }, [key, contentVersion, startAtBottom]);
  const onScroll = () => {
    following.current = distance() < 80;
    setAway(!following.current);
  };
  const latest = (smooth = true) => {
    following.current = true;
    ref.current?.scrollTo({
      top: ref.current.scrollHeight,
      behavior:
        smooth && !matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "smooth"
          : "instant",
    });
    setAway(false);
  };
  return { ref, onScroll, latest, away };
}
