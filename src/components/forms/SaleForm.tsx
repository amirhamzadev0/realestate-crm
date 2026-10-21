"use client";

import { useMemo, useState } from "react";
import { categoryLabels, saleUnit, type PlotCategory, type SaleProject } from "@/models/project";
import type { Agent } from "@/models/sales";
import { formatMoney, formatNumber } from "@/utils/format";
import { discountProblem, priceUnit, type DiscountMode } from "@/utils/pricing";
import { useActionViewModel } from "@/viewmodels/useActionViewModel";

const discountLabels: Record<DiscountMode, string> = {
  none: "No discount",
  amount: "Amount off the total (PKR)",
  rate: "Lower rate for this unit",
  percent: "Percentage off the total (%)",
};

/**
 * Records a sale. A high-rise unit is picked step by step: plot type, then floor, then unit (its size comes with it).
 * A plot is entered by number and size. The Super Admin's direct sale needs the buyer's details and can give a discount;
 * an agent sale (`mode="agent"`) cannot.
 */
export function SaleForm({
  mode,
  projects,
  agents = [],
  fixedProjectId,
}: {
  mode: "direct" | "agent";
  projects: SaleProject[];
  agents?: Agent[];
  /** Direct sales page: the project was already chosen above, so there is nothing to pick. */
  fixedProjectId?: string;
}) {
  const direct = mode === "direct";
  const { run, busy, error } = useActionViewModel(direct ? "recordDirectSale" : "recordSale");
  const [resetKey, setResetKey] = useState(0);
  const [done, setDone] = useState(false);

  const [projectId, setProjectId] = useState(fixedProjectId ?? projects[0]?.id ?? "");
  const project = projects.find((p) => p.id === projectId);
  const highRise = project?.type === "high-rise";
  const picksUnit = !!project?.hasUnitList;

  const [category, setCategory] = useState<PlotCategory | "">("");
  const [floor, setFloor] = useState("");
  const [unit, setUnit] = useState("");
  const [area, setArea] = useState("");
  const [discountMode, setDiscountMode] = useState<DiscountMode>("none");
  const [discountValue, setDiscountValue] = useState("");

  // Plot types on offer; with a unit list, only types that still have a free unit.
  const categories = useMemo(
    () =>
      (project?.rates ?? [])
        .map((r) => ({ ...r, free: picksUnit ? project!.availableUnits.filter((u) => u.category === r.category).length : undefined }))
        .filter((r) => r.free === undefined || r.free > 0),
    [project, picksUnit],
  );
  const chosenCategory = categories.find((r) => r.category === category) ?? null;

  const floors = useMemo(() => {
    if (!picksUnit || !chosenCategory) return [];
    const counts = new Map<string, number>();
    for (const u of project!.availableUnits) if (u.category === chosenCategory.category) counts.set(u.floor, (counts.get(u.floor) ?? 0) + 1);
    return [...counts].map(([name, free]) => ({ name, free }));
  }, [project, picksUnit, chosenCategory]);

  const units = useMemo(
    () =>
      picksUnit && chosenCategory
        ? project!.availableUnits.filter((u) => u.category === chosenCategory.category && u.floor === floor)
        : [],
    [project, picksUnit, chosenCategory, floor],
  );
  const chosenUnit = units.find((u) => u.unit === unit) ?? null;

  // Size and price as they will be worked out by the server.
  const sizeValue = picksUnit ? chosenUnit?.area : Number(area) > 0 ? Number(area) : undefined;
  const rate = chosenCategory?.rate;
  const discountNumber = discountValue === "" ? undefined : Number(discountValue);
  const effectiveMode: DiscountMode = direct ? discountMode : "none";
  const preview = sizeValue !== undefined && rate !== undefined ? priceUnit(sizeValue, rate, effectiveMode, discountNumber) : null;
  const problem =
    preview && rate !== undefined ? discountProblem(preview.listPrice, rate, effectiveMode, discountNumber) : null;

  function chooseProject(id: string) {
    setProjectId(id);
    setCategory("");
    setFloor("");
    setUnit("");
    setArea("");
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const text = (name: string) => String(data.get(name) ?? "").trim();
    const buyer = {
      buyer: text("buyer"),
      buyerPhone: text("buyerPhone"),
      buyerCnic: text("buyerCnic"),
      buyerEmail: text("buyerEmail"),
    };
    const ok = await run({
      projectId,
      ...(direct ? {} : { agentId: text("agentId") }),
      category,
      ...(highRise ? { floor } : {}),
      unit: picksUnit ? unit : text("unit"),
      ...(picksUnit ? {} : { area: Number(area) }),
      ...Object.fromEntries(Object.entries(buyer).filter(([, v]) => v !== "")),
      ...(direct && discountMode !== "none" ? { discountMode, discountValue: discountNumber } : {}),
    });
    setDone(ok);
    if (ok) {
      setCategory("");
      setFloor("");
      setUnit("");
      setArea("");
      setDiscountMode("none");
      setDiscountValue("");
      setResetKey((k) => k + 1); // clears the buyer fields
    }
  }

  const noUnitsLeft = picksUnit && categories.length === 0;

  return (
    <form className="form" onSubmit={onSubmit} key={resetKey}>
      <div className="form__grid">
        {!fixedProjectId ? (
          <label className="field">
            <span className="field__label">Project</span>
            <select value={projectId} onChange={(event) => chooseProject(event.target.value)} required>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.type === "high-rise" ? "high-rise" : "land plotting"})
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {!direct ? (
          <label className="field">
            <span className="field__label">Agent</span>
            <select name="agentId" required defaultValue="">
              <option value="" disabled>
                Choose an agent
              </option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.commissionRate}%)
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="field">
          <span className="field__label">1. Plot type</span>
          <select
            value={category}
            required
            onChange={(event) => {
              setCategory(event.target.value as PlotCategory);
              setFloor("");
              setUnit("");
            }}
          >
            <option value="" disabled>
              Choose the plot type
            </option>
            {categories.map((r) => (
              <option key={r.category} value={r.category}>
                {categoryLabels[r.category]} - {formatMoney(r.rate)} {project ? saleUnit[project.type].rate : ""}
                {r.free !== undefined ? ` (${r.free} free)` : ""}
              </option>
            ))}
          </select>
        </label>

        {picksUnit ? (
          <>
            <label className="field">
              <span className="field__label">2. Floor</span>
              <select
                value={floor}
                required
                disabled={!chosenCategory}
                onChange={(event) => {
                  setFloor(event.target.value);
                  setUnit("");
                }}
              >
                <option value="" disabled>
                  Choose the floor
                </option>
                {floors.map((f) => (
                  <option key={f.name} value={f.name}>
                    Floor {f.name} ({f.free} units free)
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field__label">3. Unit</span>
              <select value={unit} required disabled={!floor} onChange={(event) => setUnit(event.target.value)}>
                <option value="" disabled>
                  Choose the unit
                </option>
                {units.map((u) => (
                  <option key={u.unit} value={u.unit}>
                    {u.unit} - {formatNumber(u.area)} sq ft
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : (
          <>
            {highRise ? (
              <label className="field">
                <span className="field__label">Floor</span>
                <input type="text" required value={floor} onChange={(event) => setFloor(event.target.value)} />
              </label>
            ) : null}
            <label className="field">
              <span className="field__label">{highRise ? "Unit number" : "Plot number"}</span>
              <input name="unit" type="text" required />
            </label>
            <label className="field">
              <span className="field__label">{highRise ? "Area (sq ft)" : "Plot size (marla)"}</span>
              <input type="number" min={0} step="any" required value={area} onChange={(event) => setArea(event.target.value)} />
            </label>
          </>
        )}

        <label className="field">
          <span className="field__label">Buyer name{direct ? "" : " (optional)"}</span>
          <input name="buyer" type="text" required={direct} />
        </label>
        <label className="field">
          <span className="field__label">Buyer phone{direct ? "" : " (optional)"}</span>
          <input name="buyerPhone" type="text" required={direct} />
        </label>
        <label className="field">
          <span className="field__label">Buyer CNIC (13 digits){direct ? "" : " (optional)"}</span>
          <input name="buyerCnic" type="text" required={direct} />
        </label>
        <label className="field">
          <span className="field__label">Buyer email{direct ? "" : " (optional)"}</span>
          <input name="buyerEmail" type="text" required={direct} />
        </label>

        {direct ? (
          <>
            <label className="field">
              <span className="field__label">Discount</span>
              <select
                value={discountMode}
                onChange={(event) => {
                  setDiscountMode(event.target.value as DiscountMode);
                  setDiscountValue("");
                }}
              >
                {(Object.keys(discountLabels) as DiscountMode[]).map((m) => (
                  <option key={m} value={m}>
                    {m === "rate" && project ? `Lower rate ${saleUnit[project.type].rate}` : discountLabels[m]}
                  </option>
                ))}
              </select>
            </label>
            {discountMode !== "none" ? (
              <label className="field">
                <span className="field__label">
                  {discountMode === "amount"
                    ? "Discount amount (PKR)"
                    : discountMode === "percent"
                      ? "Discount (%)"
                      : `Rate to sell at (PKR ${project ? saleUnit[project.type].rate : ""})`}
                </span>
                <input type="number" min={0} step="any" required value={discountValue} onChange={(event) => setDiscountValue(event.target.value)} />
              </label>
            ) : null}
          </>
        ) : null}
      </div>

      {preview ? (
        <div className="price-preview" aria-live="polite">
          <span>
            {formatNumber(sizeValue ?? 0)} {project ? saleUnit[project.type].area : ""} × {formatMoney(rate ?? 0)}
          </span>
          <span>Price: {formatMoney(preview.listPrice)}</span>
          {preview.discountAmount !== 0 && !problem ? <span>Discount: − {formatMoney(preview.discountAmount)}</span> : null}
          <strong>Buyer pays: {formatMoney(problem ? preview.listPrice : preview.price)}</strong>
          {problem ? <span className="form__error">{problem}</span> : null}
        </div>
      ) : null}

      {noUnitsLeft ? <p className="form__error">No unit of this project is free to sell.</p> : null}
      {error ? (
        <p className="form__error" role="alert">
          {error}
        </p>
      ) : null}
      {done && !error ? (
        <p className="form__success">Sold. The unit is off the available units and the amount is credited to the project.</p>
      ) : null}
      <button type="submit" className="button" disabled={busy || noUnitsLeft || !!problem || (picksUnit && !chosenUnit)}>
        {busy ? "Saving..." : direct ? "Sell this unit" : "Record sale"}
      </button>
    </form>
  );
}
