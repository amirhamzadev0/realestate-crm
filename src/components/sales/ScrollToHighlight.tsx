"use client";

import { useEffect } from "react";

/** Brings the first highlighted row into the middle of the screen when the page opens (for example from the notification bell). */
export function ScrollToHighlight({ selector = ".lead-row--highlight" }: { selector?: string }) {
  useEffect(() => {
    document.querySelector(selector)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [selector]);
  return null;
}
