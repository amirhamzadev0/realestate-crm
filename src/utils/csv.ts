export type CsvCell = string | number | null | undefined;

/**
 * Turns rows into CSV text that Excel opens correctly (with a byte-order mark). Text that starts with = + - @ is prefixed
 * with an apostrophe so a name typed into the system cannot run as a formula when the file is opened.
 */
export function toCsv(rows: CsvCell[][]): string {
  const cell = (value: CsvCell): string => {
    if (value === null || value === undefined) return "";
    let text = typeof value === "number" ? String(value) : value;
    if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return `\uFEFF${rows.map((row) => row.map(cell).join(",")).join("\r\n")}\r\n`;
}
