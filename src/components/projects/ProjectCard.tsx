import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import type { AccountSummary } from "@/models/accounts";
import type { HrSummary } from "@/models/hr";
import type { Project } from "@/models/project";
import { formatCompactMoney } from "@/utils/format";

export function ProjectCard({
  project,
  accounts,
  hr,
  href,
}: {
  project: Project;
  accounts: AccountSummary;
  hr: HrSummary;
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
