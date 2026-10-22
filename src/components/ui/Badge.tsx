export type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info";

const toneByStatus: Record<string, BadgeTone> = {
  pending: "warning",
  approved: "info",
  ordered: "info",
  rejected: "danger",
  fulfilled: "success",
  todo: "neutral",
  "in-progress": "info",
  done: "success",
  new: "info",
  contacted: "neutral",
  "site-visit": "warning",
  negotiation: "warning",
  won: "success",
  lost: "danger",
  "under-construction": "info",
  planning: "neutral",
  completed: "success",
};

export function Badge({ children, tone }: { children: string; tone?: BadgeTone }) {
  const resolved = tone ?? toneByStatus[children] ?? "neutral";
  return <span className={`badge badge--${resolved}`}>{children.replace("-", " ")}</span>;
}
