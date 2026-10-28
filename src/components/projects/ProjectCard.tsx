import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import type { AccountSummary } from "@/models/accounts";
import type { HrSummary } from "@/models/hr";
import { categoryLabels, saleUnit, type Project } from "@/models/project";
import { formatCompactMoney, formatNumber } from "@/utils/format";

export function ProjectCard({
  project,
  accounts,
  hr,
  unitsSold,
  soldByCategory,
  href,
}: {
  project: Project;
  accounts: AccountSummary;
  hr: HrSummary;
  unitsSold?: number;
  soldByCategory?: Record<string, number>;
  href: string;
}) {
  return (
    <Link href={href} className="project-card">
      <div className="project-card__top">
        <h3 className="project-card__title">{project.name}</h3>
        <Badge>{project.status}</Badge>
      </div>
      <p className="muted">{project.location}</p>
      <dl className="project-card__facts">
        <div>
          <dt>Manager</dt>
          <dd>{project.adminName}</dd>
        </div>
        <div>
          <dt>Type</dt>
          <dd>{project.type === "high-rise" ? "High-rise" : "Land plotting"}</dd>
        </div>
        <div>
          <dt>Price {saleUnit[project.type].rate}</dt>
          <dd>
            {project.rates.length
              ? project.rates.map((r) => `${categoryLabels[r.category]} ${formatCompactMoney(r.rate)}`).join(" · ")
              : "Not set"}
          </dd>
        </div>
        {project.rates.some((r) => r.units !== undefined) ? (
          <div>
            <dt>Units by type (left / total)</dt>
            <dd>
              {project.rates
                .filter((r) => r.units !== undefined)
                .map((r) => `${categoryLabels[r.category]} ${Math.max(0, (r.units ?? 0) - (soldByCategory?.[r.category] ?? 0))}/${r.units}`)
                .join(" · ")}
            </dd>
          </div>
        ) : null}
        {unitsSold !== undefined ? (
          <div>
            <dt>Units left</dt>
            <dd>
              {Math.max(0, project.totalUnits - unitsSold)} / {project.totalUnits}
            </dd>
          </div>
        ) : null}
        {project.totalArea > 0 ? (
          <div>
            <dt>Total area</dt>
            <dd>
              {formatNumber(project.totalArea)} {saleUnit[project.type].area}
            </dd>
          </div>
        ) : null}
        <div>
          <dt>Budget</dt>
          <dd>{formatCompactMoney(project.budget)}</dd>
        </div>
        <div>
          <dt>Balance</dt>
          <dd>{formatCompactMoney(accounts.balance)}</dd>
        </div>
        <div>
          <dt>Staff</dt>
          <dd>{hr.employees + hr.labour}</dd>
        </div>
      </dl>
    </Link>
  );
}
