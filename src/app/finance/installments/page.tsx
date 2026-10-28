import type { Metadata } from "next";
import { InstallmentTable } from "@/components/finance/InstallmentTable";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { getInstallmentsPage, INSTALMENT_FILTERS, type InstallmentFilter } from "@/viewmodels/finance.viewmodel";

export const metadata: Metadata = { title: "Instalments" };

const filterLabels: Record<InstallmentFilter, string> = {
  open: "Not paid yet",
  overdue: "Overdue",
  "due-today": "Due today",
  promised: "Buyer asked for time",
  upcoming: "Not due yet",
  paid: "Paid",
  all: "Everything",
};

/** Every instalment, by project and by state, nearest due date first. */
export default async function InstallmentsPage({ searchParams }: { searchParams: Promise<{ project?: string; state?: string; q?: string }> }) {
  const query = await searchParams;
  const filter = INSTALMENT_FILTERS.includes(query.state as InstallmentFilter) ? (query.state as InstallmentFilter) : "open";
  const { projects, project, rows, total, shownAll } = await getInstallmentsPage(query.project, filter, query.q ?? "");

  return (
    <>
      <PageHeader title="Instalments" subtitle="Every instalment of every unit sold on a plan. Receive payments and follow buyers up from here." />
      <form className="inline-form" method="get">
        <label className="field">
          <span className="field__label">Search a buyer</span>
          <input name="q" type="search" defaultValue={query.q ?? ""} placeholder="Name, phone or unit" autoFocus={!!query.q} />
        </label>
        <label className="field">
          <span className="field__label">Project</span>
          <select name="project" defaultValue={project?.slug ?? ""}>
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.slug}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field__label">Show</span>
          <select name="state" defaultValue={filter}>
            {INSTALMENT_FILTERS.map((f) => (
              <option key={f} value={f}>
                {filterLabels[f]}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="button button--small">
          Search
        </button>
        {query.q ? (
          <a className="button button--ghost button--small" href="/finance/installments">
            Clear
          </a>
        ) : null}
      </form>
      <Card title={`${filterLabels[filter]}: ${total} ${total === 1 ? "instalment" : "instalments"}${shownAll ? "" : " (the first 300 are shown)"}`}>
        <InstallmentTable items={rows} actions />
      </Card>
    </>
  );
}
