import type { LeadSource } from "@/models/sales";

/** Reads CSV text into rows of cells. Handles quoted cells (with commas, quotes and line breaks inside), a leading byte-order mark, and tab or semicolon separators. */
export function parseCsv(text: string): string[][] {
  const source = text.replace(/^﻿/, "");
  const firstLine = source.split(/\r?\n/, 1)[0] ?? "";
  const separator = [",", ";", "\t"].map((s) => ({ s, n: firstLine.split(s).length })).sort((a, b) => b.n - a.n)[0].s;

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === separator) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && source[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** One lead as read from the file. `line` is its line in the file, so a problem can be pointed out. */
export interface ImportRow {
  line: number;
  name: string;
  phone: string;
  project: string;
  source?: string;
  email?: string;
  note?: string;
}

const columns: Record<"name" | "phone" | "project" | "source" | "email" | "note", string[]> = {
  name: ["name", "client", "client name", "lead", "lead name", "full name", "customer", "customer name"],
  phone: ["phone", "phone number", "mobile", "mobile number", "cell", "contact", "contact number", "whatsapp", "number"],
  project: ["project", "project name", "society", "scheme"],
  source: ["source", "lead source", "channel", "platform"],
  email: ["email", "e-mail", "email address", "mail"],
  note: ["note", "notes", "comment", "comments", "remarks", "message", "details"],
};

/** The first row names the columns (in any order, with common alternative names); every other row is a lead. */
export function readLeadRows(text: string): { rows: ImportRow[]; problem?: string } {
  const table = parseCsv(text);
  if (table.length === 0) return { rows: [], problem: "The file is empty" };
  const header = table[0].map((h) => h.trim().toLowerCase());
  const at = (key: keyof typeof columns) => header.findIndex((h) => columns[key].includes(h));
  const index = { name: at("name"), phone: at("phone"), project: at("project"), source: at("source"), email: at("email"), note: at("note") };
  const missing = (["name", "phone", "project"] as const).filter((k) => index[k] === -1);
  if (missing.length > 0) return { rows: [], problem: `The first row must have the columns: name, phone, project. Missing: ${missing.join(", ")}` };

  const cell = (row: string[], i: number) => (i === -1 ? "" : (row[i] ?? "").trim());
  const rows = table.slice(1).map((row, n): ImportRow => ({
    line: n + 2,
    name: cell(row, index.name),
    phone: cell(row, index.phone),
    project: cell(row, index.project),
    ...(cell(row, index.source) ? { source: cell(row, index.source) } : {}),
    ...(cell(row, index.email) ? { email: cell(row, index.email) } : {}),
    ...(cell(row, index.note) ? { note: cell(row, index.note) } : {}),
  }));
  return { rows };
}

/** A project is named in the file by its name, its web address or its id, in any case. */
export function matchProject<T extends { id: string; name: string; slug: string }>(text: string, projects: T[]): T | undefined {
  const key = text.trim().toLowerCase().replace(/\s+/g, " ");
  return projects.find((p) => p.id.toLowerCase() === key || p.slug.toLowerCase() === key || p.name.toLowerCase().replace(/\s+/g, " ") === key);
}

const sourceNames: [LeadSource, string[]][] = [
  ["facebook", ["facebook", "fb", "meta"]],
  ["instagram", ["instagram", "insta", "ig"]],
  ["walk-in", ["walk-in", "walk in", "walkin", "office", "visit"]],
  ["referral", ["referral", "reference", "referred", "friend"]],
  ["website", ["website", "web", "site", "online", "google"]],
];

/** "FB" becomes facebook, "Walk in" becomes walk-in; nothing recognisable gives undefined. */
export function matchSource(text: string | undefined): LeadSource | undefined {
  const key = (text ?? "").trim().toLowerCase();
  return sourceNames.find(([, names]) => names.includes(key))?.[0];
}

/** The sample file offered for download. */
export const sampleLeadCsv = [
  "name,phone,project,source,email,note",
  "Ali Raza,0300-1234567,Green Valley Residency,facebook,ali@example.com,Wants a 2 bed apartment",
  "Sana Malik,0321-7654321,Skyline Heights,walk-in,,Visited the office",
  "Usman Tariq,0333-1112223,Royal Gardens,referral,usman@example.com,",
].join("\n");
