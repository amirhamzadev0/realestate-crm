"use client";

/** Opens the browser's print window: from there the report can be printed or saved as a PDF. */
export function PrintButton({ label = "Print / save as PDF" }: { label?: string }) {
  return (
    <button type="button" className="button button--ghost button--small no-print" onClick={() => window.print()}>
      {label}
    </button>
  );
}
