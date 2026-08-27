"use client";

import { useEffect, useRef, useState } from "react";

// Direction-aware scroll hiding — the "premium app" chrome pattern (Gmail,
// Twitter/X, Notion mobile): the bar hides as soon as you scroll down past a
// small threshold, and reappears the instant you scroll up even slightly, so
// you never have to scroll all the way back to the top to reach it. Always
// visible near the very top of the page.
//
// `resetKey` (optional) forces the bar visible again when it changes — pass
// the pathname so navigating to a new page never leaves the header hidden.
//
// The app's global CSS sets `height: 100%` + `overflow-x: hidden` on BOTH
// html and body, which (via the browser's overflow-x/overflow-y coupling
// rule) makes overflow-y compute to `auto` on both — so on many pages the
// actual scrolling happens inside `<body>`'s own box, not the `window`/
// viewport. `window.scrollY` then never changes, so a listener on `window`
// alone silently never fires. Scroll events don't bubble, but they DO reach
// capture-phase listeners on ancestors — so we listen on `document` with
// `capture: true` and read the scroll position off whatever element the
// event actually fired on. This works no matter which element ends up being
// the real scrolling container.
function readScrollTop(target) {
  if (!target || target === document) {
    return (
      window.scrollY ||
      document.documentElement.scrollTop ||
      document.body.scrollTop ||
      0
    );
  }
  return target.scrollTop || 0;
}

export function useHideOnScroll({ threshold = 6, topOffset = 24, resetKey } = {}) {
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);

  useEffect(() => {
    setHidden(false);
    lastY.current = readScrollTop(document);
  }, [resetKey]);

  useEffect(() => {
    lastY.current = readScrollTop(document);
    let ticking = false;
    let pendingTarget = null;

    const update = () => {
      const y = readScrollTop(pendingTarget);
      const diff = y - lastY.current;

      if (y <= topOffset) {
        setHidden(false);
      } else if (diff > threshold) {
        setHidden(true);
      } else if (diff < -threshold) {
        setHidden(false);
      }
      lastY.current = y;
      ticking = false;
    };

    const onScroll = (e) => {
      pendingTarget = e.target;
      if (!ticking) {
        window.requestAnimationFrame(update);
        ticking = true;
      }
    };

    document.addEventListener("scroll", onScroll, { passive: true, capture: true });
    return () => document.removeEventListener("scroll", onScroll, { capture: true });
  }, [threshold, topOffset]);

  return hidden;
}
