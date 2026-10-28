"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { apiRequest } from "@/utils/http-client";
import { matchProject, readLeadRows, sampleLeadCsv, type ImportRow } from "@/utils/lead-import";

interface ImportResult {
  imported: number;
  duplicates: number;
  errors: { line: number; message: string }[];
  byProject: { projectId: string; projectName: string; count: number }[];
}

/** Leads sent to the server in one request. */
const CHUNK = 500;

type ProjectRef = { id: string; name: string; slug: string };

/** What is wrong with a row, as far as the browser can tell; the server checks everything again on import. */
function problemWith(row: ImportRow, projects: ProjectRef[]): string | null {
  if (!row.name) return "The name is empty";
  if (!/^[0-9+\-\s()]{7,20}$/.test(row.phone)) return `"${row.phone}" is not a valid phone number`;
  if (!row.project) return "The project is empty";
  if (!matchProject(row.project, projects)) return `There is no project called "${row.project}"`;
  if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) return `"${row.email}" is not a valid email`;
  return null;
}

/**
 * Uploads a CSV file of leads. The file is read and checked here first: how many leads each project would get, and which rows
 * have a problem. Nothing is saved until "Import" is pressed; rows with a problem are skipped and the rest are added, without an
 * agent, ready to be shared.
 */
export function LeadImport({ projects }: { projects: ProjectRef[] }) {
  const router = useRouter();
  const [fileName, setFileName] = useState("");
  const [text, setText] = useState("");
  const [source, setSource] = useState("website");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [progress, setProgress] = useState("");

  const parsed = useMemo(() => (text ? readLeadRows(text) : null), [text]);
  const checked = useMemo(
    () => (parsed?.rows ?? []).map((row) => ({ row, problem: problemWith(row, projects) })),
    [parsed, projects],
  );
  const good = checked.filter((c) => !c.problem);
  const bad = checked.filter((c) => c.problem);
  const perProject = useMemo(() => {
    const counts = new Map<string, number>();
    for (const { row } of good) {
      const name = matchProject(row.project, projects)?.name ?? row.project;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return [...counts].sort((a, b) => a[0].localeCompare(b[0]));
  }, [good, projects]);

  async function onFile(file: File | undefined) {
    setResult(null);
    setError(null);
    if (!file) return;
    setFileName(file.name);
    setText(await file.text());
  }

  /** A file of any size is sent in parts, so one request never gets too big; the answers are added up. */
  async function send() {
    setBusy(true);
    setError(null);
    const total: ImportResult = { imported: 0, duplicates: 0, errors: [], byProject: [] };
    const rows = good.map((c) => c.row);
    try {
      for (let from = 0; from < rows.length; from += CHUNK) {
        setProgress(`Importing ${Math.min(from + CHUNK, rows.length)} of ${rows.length}...`);
        const part = await apiRequest<ImportResult>("importLeads", { defaultSource: source, leads: rows.slice(from, from + CHUNK) });
        total.imported += part.imported;
        total.duplicates += part.duplicates;
        total.errors.push(...part.errors);
        for (const p of part.byProject) {
          const known = total.byProject.find((t) => t.projectId === p.projectId);
          if (known) known.count += p.count;
          else total.byProject.push({ ...p });
        }
      }
      setResult(total);
      setText("");
      setFileName("");
    } catch (caught) {
      // The parts that were saved before the problem stay saved; say how many.
      setResult(total.imported > 0 ? total : null);
      setError(`${caught instanceof Error ? caught.message : "Something went wrong"}${total.imported > 0 ? ` (${total.imported} leads were imported before it stopped; uploading the file again skips them)` : ""}`);
    } finally {
      setProgress("");
      setBusy(false);
      router.refresh();
    }
  }

  return (
    <div className="form">
      <p className="muted">
        Upload a CSV file (it opens in Excel). The first row names the columns: <strong>name, phone, project</strong> are needed; <strong>source, email, note</strong> are
        optional. The project is its name as it is in this system.{" "}
        <a href={`data:text/csv;charset=utf-8,${encodeURIComponent(sampleLeadCsv)}`} download="leads-sample.csv" className="link">
          Download a sample file
        </a>
      </p>
      <div className="inline-form">
        <label className="field">
          <span className="field__label">CSV file</span>
          <input type="file" accept=".csv,text/csv,.txt" onChange={(event) => void onFile(event.target.files?.[0])} />
        </label>
        <label className="field">
          <span className="field__label">Source for rows that do not say</span>
          <select value={source} onChange={(event) => setSource(event.target.value)}>
            <option value="website">Website</option>
            <option value="facebook">Facebook</option>
            <option value="instagram">Instagram</option>
            <option value="walk-in">Walk-in</option>
            <option value="referral">Referral</option>
          </select>
        </label>
      </div>

      {parsed?.problem ? (
        <p className="form__error" role="alert">
          {parsed.problem}
        </p>
      ) : null}

      {parsed && !parsed.problem ? (
        <div className="review">
          <strong>
            {fileName}: {checked.length} rows, {good.length} ready to import{bad.length ? `, ${bad.length} with a problem (they will be skipped)` : ""}
          </strong>
          {perProject.length > 0 ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Project</th>
                    <th className="num">Leads in the file</th>
                  </tr>
                </thead>
                <tbody>
                  {perProject.map(([name, count]) => (
                    <tr key={name}>
                      <td>{name}</td>
                      <td className="num">{count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {bad.length > 0 ? (
            <details>
              <summary>Rows with a problem ({bad.length})</summary>
              <ul>
                {bad.slice(0, 50).map(({ row, problem }) => (
                  <li key={row.line}>
                    Line {row.line}: {problem}
                  </li>
                ))}
                {bad.length > 50 ? <li>and {bad.length - 50} more</li> : null}
              </ul>
            </details>
          ) : null}
          <button type="button" className="button" disabled={busy || good.length === 0} onClick={() => void send()}>
            {busy ? progress || "Importing..." : `Import ${good.length} leads`}
          </button>
        </div>
      ) : null}

      {error ? (
        <p className="form__error" role="alert">
          {error}
        </p>
      ) : null}
      {result ? (
        <div className="form__success">
          {result.imported} leads imported
          {result.byProject.length ? `: ${result.byProject.map((p) => `${p.projectName} ${p.count}`).join(", ")}` : ""}.
          {result.duplicates ? ` ${result.duplicates} were already in the system and were skipped.` : ""}
          {result.errors.length ? ` ${result.errors.length} rows had a problem and were skipped.` : ""} They are not forwarded to an agent yet: share them below.
        </div>
      ) : null}
    </div>
  );
}
