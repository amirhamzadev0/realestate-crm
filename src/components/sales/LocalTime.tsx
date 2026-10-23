"use client";

import { useEffect, useState } from "react";

/**
 * A date and time shown in the viewer's own time zone. The server only knows UTC, so the real time is filled in once the
 * page is in the browser; until then the UTC time is shown.
 */
export function LocalTime({ iso, dateOnly = false }: { iso: string; dateOnly?: boolean }) {
  const [text, setText] = useState("");
  useEffect(() => {
    const date = new Date(iso);
    setText(
      dateOnly
        ? date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
        : date.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true }),
    );
  }, [iso, dateOnly]);
  return <time dateTime={iso}>{text || iso.slice(0, 16).replace("T", " ")}</time>;
}
