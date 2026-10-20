import { Badge } from "@/components/ui/Badge";
import type { Campaign, CampaignPerformance } from "@/models/sales";
import { formatMoney } from "@/utils/format";

export function CampaignTable({
  rows,
}: {
  rows: { campaign: Campaign; projectName: string; performance?: CampaignPerformance }[];
}) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Campaign</th>
            <th>Project</th>
            <th>Platform</th>
            <th className="num">Budget</th>
            <th className="num">Leads</th>
            <th className="num">Won</th>
            <th className="num">Cost / lead</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ campaign, projectName, performance }) => (
            <tr key={campaign.id}>
              <td>{campaign.name}</td>
              <td>{projectName}</td>
              <td>{campaign.platform}</td>
              <td className="num">{formatMoney(campaign.budget)}</td>
              <td className="num">{performance?.leads ?? 0}</td>
              <td className="num">{performance?.won ?? 0}</td>
              <td className="num">{performance?.costPerLead ? formatMoney(performance.costPerLead) : "-"}</td>
              <td>
                <Badge tone={campaign.active ? "success" : "neutral"}>{campaign.active ? "running" : "paused"}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
