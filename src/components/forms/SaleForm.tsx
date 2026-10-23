"use client";

import { useMemo, useState } from "react";
import { categoryLabels, saleUnit, type PlotCategory, type SaleProject } from "@/models/project";
import type { Lead, SalesManager } from "@/models/sales";

/** A lead an agent can sell: choosing it fills in the buyer. */
export type SaleLead = Pick<Lead, "id" | "name" | "phone" | "email">;
import { formatMoney, formatNumber } from "@/utils/format";
import { discountProblem, priceUnit, type DiscountMode } from "@/utils/pricing";
import { useActionViewModel } from "@/viewmodels/useActionViewModel";

/** "agent:ag1" -> { agentId: "ag1" }, "manager:sm1" -> { managerId: "sm1" }. */
function sellerFields(seller: string): { agentId?: string; managerId?: string } {
  const [kind, id] = seller.split(":");
  return kind === "manager" ? { managerId: id } : { agentId: id };
}

const discountLabels: Record<DiscountMode, string> = {
  none: "No discount",
  amount: "Amount off the total (PKR)",
  rate: "Lower rate for this unit",
  percent: "Percentage off the total (%)",
};

/**
 * Records a sale. A high-rise unit is picked step by step: plot type, then floor, then unit (its size comes with it).
 * A plot is entered by number and size. A direct sale (Super Admin or sales manager) and an agent selling one of their leads
 * (`mode="lead"`, picking which of their leads is buying) need the buyer's details and can give a discount; the plain agent sale in the Sales portal (`mode="agent"`) cannot.
 */
export function SaleForm({
  mode,
  projects,
  sellers = [],
  fixedProjectId,
  managers,
  agentId,
  leads = [],
  defaultLeadId,
}: {
  mode: "direct" | "agent" | "lead";
  projects: SaleProject[];
  /** Agent sale: who sold it, "agent:<id>" or "manager:<id>" (the sales manager selling himself). */
  sellers?: { value: string; label: string }[];
  /** Direct sales page: the project was already chosen above, so there is nothing to pick. */
  fixedProjectId?: string;
  /** A sales manager's direct sale: who is selling. Left out for the Super Admin. */
  managers?: SalesManager[];
  /** `mode="lead"`: the agent who is selling, and their leads that have not been sold yet. */
  agentId?: string;
  leads?: SaleLead[];
  /** `mode="lead"`: the lead that is chosen when the form opens. */
  defaultLeadId?: string;
}) {
  const direct = mode !== "agent"; // full buyer details and a discount
  const { run, busy, error } = useActionViewModel(mode === "direct" ? "recordDirectSale" : mode === "lead" ? "recordAgentSale" : "recordSale");
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

  // The buyer. Choosing one of the agent's leads fills in the client's name, phone and email; the CNIC is typed in.
  const startLead = leads.find((l) => l.id === defaultLeadId);
  const [leadId, setLeadId] = useState(startLead?.id ?? "");
  const [buyerName, setBuyerName] = useState(startLead?.name ?? "");
  const [buyerPhone, setBuyerPhone] = useState(startLead?.phone ?? "");
  const [buyerCnic, setBuyerCnic] = useState("");
  const [buyerEmail, setBuyerEmail] = useState(startLead?.email ?? "");

  function chooseLead(id: string) {
    setLeadId(id);
    const chosen = leads.find((l) => l.id === id);
    if (chosen) {
      setBuyerName(chosen.name);
      setBuyerPhone(chosen.phone);
      setBuyerEmail(chosen.email ?? "");
    }
  }

  // Plot types on offer; with a unit list, only types that still have a free unit.
  const categories = useMemo(
    () =>
      (project?.rates ?? [])
        .map((r) => ({ ...r, free: picksUnit ? project!.availableUnits.filter((u) => u.category === r.category).length : undefined })),
    [project, picksUnit],
  );
  const chosenCategory = categories.find((r) => r.category === category) ?? null;

  const floors = useMemo(() => {
    if (!picksUnit || !chosenCategory) return [];
    // Every floor of this plot type, with how many of its units are still free; a floor with none is shown as sold out.
    const counts = new Map<string, number>();
    for (const u of project!.allUnits) if (u.category === chosenCategory.category) counts.set(u.floor, (counts.get(u.floor) ?? 0) + (u.sold ? 0 : 1));
    return [...counts].map(([name, free]) => ({ name, free }));
  }, [project, picksUnit, chosenCategory]);

  const units = useMemo(
    () =>
      picksUnit && chosenCategory
        ? project!.allUnits.filter((u) => u.category === chosenCategory.category && u.floor === floor)
        : [],
    [project, picksUnit, chosenCategory, floor],
  );
  const chosenUnit = units.find((u) => u.unit === unit && !u.sold) ?? null;

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
    const buyer = { buyer: buyerName.trim(), buyerPhone: buyerPhone.trim(), buyerCnic: buyerCnic.trim(), buyerEmail: buyerEmail.trim() };
    const ok = await run({
      projectId,
      ...(mode === "lead"
        ? { agentId, ...(leadId ? { leadId } : {}) }
        : direct
          ? managers
            ? { managerId: text("managerId") }
            : {}
          : sellerFields(text("seller"))),
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
      setLeadId("");
      setBuyerName("");
      setBuyerPhone("");
      setBuyerCnic("");
      setBuyerEmail("");
      setResetKey((k) => k + 1);
    }
  }

  const noUnitsLeft = picksUnit && categories.every((r) => r.free === 0);

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
        {mode === "lead" ? (
          <label className="field">
            <span className="field__label">Which lead is buying (optional)</span>
            <select value={leadId} onChange={(event) => chooseLead(event.target.value)}>
              <option value="">A client who is not in my leads</option>
              {leads.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} - {l.phone}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {mode === "direct" && managers ? (
          <label className="field">
            <span className="field__label">Sold by (sales manager)</span>
            <select name="managerId" required defaultValue={managers.length === 1 ? managers[0].id : ""}>
              <option value="" disabled>
                Choose the sales manager
              </option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {!direct ? (
          <label className="field">
            <span className="field__label">Sold by</span>
            <select name="seller" required defaultValue="">
              <option value="" disabled>
                Choose an agent or the sales manager
              </option>
              {sellers.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
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
              <option key={r.category} value={r.category} disabled={r.free === 0}>
                {categoryLabels[r.category]} - {formatMoney(r.rate)} {project ? saleUnit[project.type].rate : ""}
                {r.free !== undefined ? (r.free === 0 ? " (all sold)" : ` (${r.free} free)`) : ""}
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
                  <option key={f.name} value={f.name} disabled={f.free === 0}>
                    Floor {f.name} ({f.free === 0 ? "all sold" : `${f.free} units free`})
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
                  <option key={u.unit} value={u.unit} disabled={u.sold}>
                    {u.unit} - {formatNumber(u.area)} sq ft{u.sold ? " - SOLD" : ""}
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
          <input name="buyer" type="text" required={direct} value={buyerName} onChange={(event) => setBuyerName(event.target.value)} />
        </label>
        <label className="field">
          <span className="field__label">Buyer phone{direct ? "" : " (optional)"}</span>
          <input name="buyerPhone" type="text" required={direct} value={buyerPhone} onChange={(event) => setBuyerPhone(event.target.value)} />
        </label>
        <label className="field">
          <span className="field__label">Buyer CNIC (13 digits){direct ? "" : " (optional)"}</span>
          <input name="buyerCnic" type="text" required={direct} value={buyerCnic} onChange={(event) => setBuyerCnic(event.target.value)} />
        </label>
        <label className="field">
          <span className="field__label">Buyer email{direct ? "" : " (optional)"}</span>
          <input name="buyerEmail" type="text" required={direct} value={buyerEmail} onChange={(event) => setBuyerEmail(event.target.value)} />
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
        {busy ? "Saving..." : mode === "lead" ? "Sell to this client" : direct ? "Sell this unit" : "Record sale"}
      </button>
    </form>
  );
}
