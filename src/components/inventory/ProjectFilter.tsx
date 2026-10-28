"use client";

import { useRouter } from "next/navigation";

/** Picks the project whose order records are shown; the page reloads straight away with that project's records. */
export function ProjectFilter({ projects, current, month }: { projects: { slug: string; name: string }[]; current: string; month: string | null }) {
  const router = useRouter();
  return (
    <label className="field">
      <span className="field__label">Project</span>
      <select
        value={current}
        onChange={(event) => {
          const params = new URLSearchParams();
          if (event.target.value) params.set("project", event.target.value);
          if (month) params.set("month", month);
          const query = params.toString();
          router.push(`/warehouse/history${query ? `?${query}` : ""}`);
        }}
      >
        <option value="">All projects</option>
        {projects.map((p) => (
          <option key={p.slug} value={p.slug}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  );
}
