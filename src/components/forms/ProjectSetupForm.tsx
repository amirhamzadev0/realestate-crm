"use client";

import { useRef, useState } from "react";
import type { ManagerView } from "@/models/manager";
import {
  categoryLabels,
  plotCategories,
  saleUnit,
  type PlotCategory,
  type Project,
  type ProjectType,
} from "@/models/project";
import { formatMoney, formatNumber } from "@/utils/format";
import { useActionViewModel } from "@/viewmodels/useActionViewModel";

interface UnitRow {
  category: PlotCategory;
  floor: string;
  unit: string;
  area: string;
}

/** The floor being filled in before it is added: its name and one row per unit. */
interface FloorDraft {
  floor: string;
  count: string;
  rows: { unit: string; area: string }[];
  sameSize: string;
  error: string;
}

interface ProjectPayload {
  type?: ProjectType;
  id?: string;
  name: string;
  location: string;
  status: string;
  startDate: string;
  budget: number;
  totalUnits?: number;
  managerId: string | null;
  rates: { category: PlotCategory; rate: number; units?: number }[];
  units: { category: PlotCategory; floor: string; unit: string; area: number }[];
}

const emptyDraft: FloorDraft = { floor: "", count: "", rows: [], sameSize: "", error: "" };
const MAX_UNITS_PER_FLOOR = 200;

const autoName = (floor: string, index: number) => `${floor.trim()}-${String(index + 1).padStart(2, "0")}`;

/**
 * Create or edit a project: details, a price for each plot type on offer and, for a land plotting, how many plots each
 * type has. For a high-rise every plot type gets its floors: pick a floor, say how many units it has, give each unit
 * its size and press "Add floor"; a floor then shows as one line with an Edit button. Creating a project ends with a review
 * page: nothing is saved until the Super Admin confirms, and confirming makes the project live. Pass `project` to edit
 * (the type is then fixed; saving applies straight away).
 */
export function ProjectSetupForm({ project, managers }: { project?: Project; managers: ManagerView[] }) {
  const editing = !!project;
  const { run, busy, error } = useActionViewModel(editing ? "updateProject" : "createProject");

  const [type, setType] = useState<ProjectType>(project?.type ?? "high-rise");
  const [totalUnits, setTotalUnits] = useState(project && project.type === "land-plotting" ? String(project.totalUnits) : "");
  const [typeUnits, setTypeUnits] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      (project && project.type === "land-plotting" ? project.rates : []).filter((r) => r.units !== undefined).map((r) => [r.category, String(r.units)]),
    ),
  );
  const [rows, setRows] = useState<UnitRow[]>(
    project?.units.map((u) => ({ category: u.category, floor: u.floor, unit: u.unit, area: String(u.area) })) ?? [],
  );
  const [drafts, setDrafts] = useState<Record<string, FloorDraft>>({});
  const [openFloors, setOpenFloors] = useState<Record<string, boolean>>({}); // floors whose unit table is open for editing
  const [review, setReview] = useState<ProjectPayload | null>(null); // the project waiting for confirmation
  const [reviewError, setReviewError] = useState("");
  const [done, setDone] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const freeManagers = managers.filter((m) => m.active && (m.projectId === null || m.projectId === project?.id));
  const unit = saleUnit[type];
  const highRise = type === "high-rise";
  const countOf = (category: PlotCategory) => rows.filter((r) => r.category === category).length;
  const plotsTotal = Object.values(typeUnits).reduce((sum, v) => sum + (Number(v) || 0), 0);
  const landMismatch = !highRise && plotsTotal > 0 && totalUnits !== "" && Number(totalUnits) !== plotsTotal;

  function setTypeUnit(category: PlotCategory, value: string) {
    const next = { ...typeUnits, [category]: value };
    setTypeUnits(next);
    const sum = Object.values(next).reduce((total, v) => total + (Number(v) || 0), 0);
    setTotalUnits(sum > 0 ? String(sum) : "");
  }

  const draftOf = (category: PlotCategory) => drafts[category] ?? emptyDraft;
  const patchDraft = (category: PlotCategory, patch: Partial<FloorDraft>) =>
    setDrafts((current) => ({ ...current, [category]: { ...(current[category] ?? emptyDraft), ...patch, error: "" } }));

  /** Typing the floor renames the units that still carry the automatic name. */
  function setDraftFloor(category: PlotCategory, floor: string) {
    const draft = draftOf(category);
    patchDraft(category, {
      floor,
      rows: draft.rows.map((row, i) => (row.unit === autoName(draft.floor, i) || row.unit === "" ? { ...row, unit: autoName(floor, i) } : row)),
    });
  }

  /** Typing "5 units" shows 5 rows to fill in; changing the number keeps what was already typed. */
  function setDraftCount(category: PlotCategory, count: string) {
    const draft = draftOf(category);
    const n = Math.min(Math.max(Math.floor(Number(count)) || 0, 0), MAX_UNITS_PER_FLOOR);
    const next = Array.from({ length: n }, (_, i) => draft.rows[i] ?? { unit: autoName(draft.floor, i), area: draft.sameSize });
    patchDraft(category, { count, rows: next });
  }

  function setDraftRow(category: PlotCategory, index: number, patch: Partial<{ unit: string; area: string }>) {
    const draft = draftOf(category);
    patchDraft(category, { rows: draft.rows.map((row, i) => (i === index ? { ...row, ...patch } : row)) });
  }

  function applySameSize(category: PlotCategory) {
    const draft = draftOf(category);
    patchDraft(category, { rows: draft.rows.map((row) => ({ ...row, area: draft.sameSize })) });
  }

  /** Moves the drafted floor into the project after checking it. */
  function addFloor(category: PlotCategory) {
    const draft = draftOf(category);
    const floor = draft.floor.trim();
    const fail = (message: string) => setDrafts((current) => ({ ...current, [category]: { ...draft, error: message } }));

    if (!floor) return fail("Enter the floor.");
    if (draft.rows.length === 0) return fail("Enter how many units are on this floor.");
    if (rows.some((r) => r.category === category && r.floor.toLowerCase() === floor.toLowerCase())) {
      return fail(`Floor ${floor} is already added for ${categoryLabels[category]}. Change its units in the list below.`);
    }
    const names = draft.rows.map((r) => r.unit.trim());
    if (names.some((n) => !n)) return fail("Every unit needs a number.");
    if (new Set(names.map((n) => n.toLowerCase())).size !== names.length) return fail("Two units on this floor have the same number.");
    const clash = names.find((n) => rows.some((r) => r.unit.toLowerCase() === n.toLowerCase()));
    if (clash) return fail(`Unit ${clash} already exists in this project. Give it another number.`);
    if (draft.rows.some((r) => !(Number(r.area) > 0))) return fail("Enter the size in sq ft for every unit.");

    setRows((current) => [...current, ...draft.rows.map((r) => ({ category, floor, unit: r.unit.trim(), area: r.area }))]);
    setDrafts((current) => ({ ...current, [category]: emptyDraft }));
  }

  function setRow(index: number, patch: Partial<UnitRow>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  /** Adds one more unit to a floor that is already in the list. */
  function addUnitToFloor(category: PlotCategory, floor: string) {
    const taken = new Set(rows.map((r) => r.unit.toLowerCase()));
    let n = rows.filter((r) => r.category === category && r.floor === floor).length;
    let name = autoName(floor, n);
    while (taken.has(name.toLowerCase())) name = autoName(floor, ++n);
    setRows((current) => {
      const lastOfFloor = current.map((r, i) => (r.category === category && r.floor === floor ? i : -1)).filter((i) => i >= 0).pop() ?? current.length - 1;
      return [...current.slice(0, lastOfFloor + 1), { category, floor, unit: name, area: "" }, ...current.slice(lastOfFloor + 1)];
    });
  }

  /** Everything typed in, in the shape the API takes. */
  function buildPayload(form: HTMLFormElement): ProjectPayload {
    const data = new FormData(form);
    const text = (name: string) => String(data.get(name) ?? "").trim();
    const rates = plotCategories
      .map((category) => ({ category, raw: text(`rate_${category}`) }))
      .filter((r) => r.raw !== "")
      .map((r) => ({
        category: r.category,
        rate: Number(r.raw),
        ...(!highRise && typeUnits[r.category] ? { units: Number(typeUnits[r.category]) } : {}),
      }));
    return {
      ...(project ? { id: project.id } : { type }),
      name: text("name"),
      location: text("location"),
      status: text("status"),
      startDate: text("startDate"),
      budget: Number(text("budget")),
      ...(!highRise && totalUnits !== "" ? { totalUnits: Number(totalUnits) } : {}),
      managerId: text("managerId") || null,
      rates,
      units: highRise ? rows.map((r) => ({ category: r.category, floor: r.floor.trim(), unit: r.unit.trim(), area: Number(r.area) })) : [],
    };
  }

  /** What must be right before the review page makes sense; the server checks everything again on confirm. */
  function problemWith(body: ProjectPayload): string {
    if (body.rates.length === 0) return "Give a price to at least one plot type.";
    if (!highRise) return "";
    if (body.units.length === 0) return "Add at least one floor with its units.";
    const priced = new Set(body.rates.map((r) => r.category));
    const missing = plotCategories.find((c) => countOf(c) > 0 && !priced.has(c));
    if (missing) return `Give a price to the ${categoryLabels[missing]} units.`;
    if (body.units.some((u) => !u.floor || !u.unit || !(u.area > 0))) return "Every unit needs a floor, a number and a size in sq ft.";
    return "";
  }

  async function send(body: ProjectPayload) {
    const ok = await run({ ...body });
    setDone(ok);
    if (ok && !editing) {
      setReview(null);
      setTotalUnits("");
      setTypeUnits({});
      setRows([]);
      setDrafts({});
      setOpenFloors({});
      formRef.current?.reset();
    } else if (!ok) {
      setReview(null); // back to the form so the problem can be fixed
    }
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = buildPayload(event.currentTarget);
    if (editing) {
      void send(body);
      return;
    }
    const problem = problemWith(body);
    setReviewError(problem);
    if (!problem) {
      setDone(false);
      setReview(body);
    }
  }

  return (
    <form className="form" onSubmit={onSubmit} ref={formRef}>
      <div hidden={review !== null} className="form">
      <div className="form__grid">
        <label className="field">
          <span className="field__label">Project name</span>
          <input name="name" type="text" required defaultValue={project?.name} />
        </label>
        <label className="field">
          <span className="field__label">Location</span>
          <input name="location" type="text" required defaultValue={project?.location} />
        </label>
        {!editing ? (
          <label className="field">
            <span className="field__label">Project type</span>
            <select value={type} onChange={(event) => setType(event.target.value as ProjectType)}>
              <option value="high-rise">High-rise (sold per sq ft)</option>
              <option value="land-plotting">Land plotting (sold per marla)</option>
            </select>
          </label>
        ) : null}
        <label className="field">
          <span className="field__label">Status</span>
          <select name="status" required defaultValue={project?.status ?? "planning"}>
            <option value="planning">Planning</option>
            <option value="under-construction">Under construction</option>
            <option value="completed">Completed</option>
          </select>
        </label>
        <label className="field">
          <span className="field__label">Start date</span>
          <input name="startDate" type="date" required defaultValue={project?.startDate} />
        </label>
        <label className="field">
          <span className="field__label">Budget (PKR)</span>
          <input name="budget" type="number" min={0} step="any" required defaultValue={project ? String(project.budget) : undefined} />
        </label>
        <label className="field">
          <span className="field__label">Manager</span>
          <select name="managerId" defaultValue={project?.managerId ?? ""}>
            <option value="">None</option>
            {freeManagers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        {!highRise ? (
          <label className="field">
            <span className="field__label">Total units (the plots of all types added up)</span>
            <input type="number" min={0} step="1" value={totalUnits} onChange={(event) => setTotalUnits(event.target.value)} />
          </label>
        ) : null}
      </div>

      <div>
        <h3 className="form__subtitle">Plot types: price{highRise ? "" : " and number of plots"} ({unit.rate})</h3>
        <p className="muted">
          {highRise
            ? "Give a price to every plot type this high-rise sells. The floors and units of each type are added below."
            : "Fill in the types this project sells and how many plots each has. Leave a type empty if it is not offered."}
        </p>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Plot type</th>
                <th>Price {unit.rate} (PKR)</th>
                <th>Units</th>
              </tr>
            </thead>
            <tbody>
              {plotCategories.map((category) => (
                <tr key={category}>
                  <td>{categoryLabels[category]}</td>
                  <td>
                    <input
                      name={`rate_${category}`}
                      type="number"
                      min={0}
                      step="any"
                      aria-label={`${categoryLabels[category]} price`}
                      defaultValue={project?.rates.find((r) => r.category === category)?.rate}
                    />
                  </td>
                  <td>
                    {highRise ? (
                      countOf(category)
                    ) : (
                      <input
                        type="number"
                        min={1}
                        step="1"
                        aria-label={`${categoryLabels[category]} units`}
                        value={typeUnits[category] ?? ""}
                        onChange={(event) => setTypeUnit(category, event.target.value)}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!highRise && plotsTotal > 0 ? <p className="muted">{formatNumber(plotsTotal)} plots in total across the plot types</p> : null}
        {landMismatch ? (
          <p className="form__error" role="alert">
            Total units ({formatNumber(Number(totalUnits))}) must equal the plots of all types ({formatNumber(plotsTotal)}).
          </p>
        ) : null}
      </div>

      {highRise ? (
        <div>
          <h3 className="form__subtitle">Floors and units ({formatNumber(rows.length)} units in total)</h3>
          <p className="muted">
            For each plot type: choose a floor, say how many units are on it, give each unit its size in sq ft, then press &quot;Add floor&quot; (and &quot;Add another floor&quot; for the next one). At sale
            time the buyer picks the plot type, then the floor, then the unit.
          </p>
          {plotCategories.map((category) => {
            const draft = draftOf(category);
            const categoryRows = rows.map((row, index) => ({ row, index })).filter(({ row }) => row.category === category);
            const floors = [...new Set(categoryRows.map(({ row }) => row.floor))];
            return (
              <fieldset key={category} className="unit-group">
                <legend>
                  {categoryLabels[category]} ({categoryRows.length} units on {floors.length} {floors.length === 1 ? "floor" : "floors"})
                </legend>

                {floors.map((floor) => {
                  const floorRows = categoryRows.filter(({ row }) => row.floor === floor);
                  const key = `${category}|${floor}`;
                  const open = !!openFloors[key];
                  const sizes = floorRows.map(({ row }) => Number(row.area)).filter((n) => n > 0);
                  const sizeText = sizes.length
                    ? Math.min(...sizes) === Math.max(...sizes)
                      ? `${formatNumber(sizes[0])} sq ft each`
                      : `${formatNumber(Math.min(...sizes))} - ${formatNumber(Math.max(...sizes))} sq ft`
                    : "no size yet";
                  return (
                    <div key={floor} className="floor-block">
                      <div className="floor-block__head">
                        <span>
                          <strong>Floor {floor}</strong> - {floorRows.length} units - {sizeText}
                        </span>
                        <span className="row-actions">
                          <button
                            type="button"
                            className="button button--ghost button--small"
                            onClick={() => setOpenFloors((current) => ({ ...current, [key]: !open }))}
                          >
                            {open ? "Done" : "Edit floor"}
                          </button>
                          <button
                            type="button"
                            className="button button--danger button--small"
                            onClick={() => setRows((current) => current.filter((r) => !(r.category === category && r.floor === floor)))}
                          >
                            Remove floor
                          </button>
                        </span>
                      </div>
                      {open ? (
                        <>
                          <div className="table-wrap">
                            <table className="table">
                              <thead>
                                <tr>
                                  <th>Unit number</th>
                                  <th>Size (sq ft)</th>
                                  <th />
                                </tr>
                              </thead>
                              <tbody>
                                {floorRows.map(({ row, index }) => (
                                  <tr key={index}>
                                    <td>
                                      <input type="text" aria-label="Unit number" value={row.unit} onChange={(event) => setRow(index, { unit: event.target.value })} />
                                    </td>
                                    <td>
                                      <input type="number" min={0} step="any" aria-label="Size in sq ft" value={row.area} onChange={(event) => setRow(index, { area: event.target.value })} />
                                    </td>
                                    <td>
                                      <button type="button" className="button button--danger button--small" onClick={() => setRows((current) => current.filter((_, i) => i !== index))}>
                                        Remove
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <button type="button" className="button button--ghost button--small" onClick={() => addUnitToFloor(category, floor)}>
                            Add a unit to this floor
                          </button>
                        </>
                      ) : null}
                    </div>
                  );
                })}
                <div className="floor-draft">
                  {floors.length > 0 ? <strong>Add another floor</strong> : null}
                  <div className="inline-form">
                    <label className="field">
                      <span className="field__label">Floor</span>
                      <input type="text" placeholder="e.g. 3 or G" value={draft.floor} onChange={(event) => setDraftFloor(category, event.target.value)} />
                    </label>
                    <label className="field">
                      <span className="field__label">Units on this floor</span>
                      <input
                        type="number"
                        min={1}
                        max={MAX_UNITS_PER_FLOOR}
                        step="1"
                        placeholder="e.g. 5"
                        value={draft.count}
                        onChange={(event) => setDraftCount(category, event.target.value)}
                      />
                    </label>
                    {draft.rows.length > 0 ? (
                      <>
                        <label className="field">
                          <span className="field__label">Same size for all (sq ft)</span>
                          <input type="number" min={0} step="any" value={draft.sameSize} onChange={(event) => patchDraft(category, { sameSize: event.target.value })} />
                        </label>
                        <button type="button" className="button button--ghost button--small" onClick={() => applySameSize(category)}>
                          Apply to all
                        </button>
                      </>
                    ) : null}
                  </div>

                  {draft.rows.length > 0 ? (
                    <div className="table-wrap">
                      <table className="table">
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>Unit number</th>
                            <th>Size (sq ft)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {draft.rows.map((row, index) => (
                            <tr key={index}>
                              <td>{index + 1}</td>
                              <td>
                                <input type="text" aria-label={`Unit ${index + 1} number`} value={row.unit} onChange={(event) => setDraftRow(category, index, { unit: event.target.value })} />
                              </td>
                              <td>
                                <input
                                  type="number"
                                  min={0}
                                  step="any"
                                  aria-label={`Unit ${index + 1} size in sq ft`}
                                  value={row.area}
                                  onChange={(event) => setDraftRow(category, index, { area: event.target.value })}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}

                  {draft.error ? (
                    <p className="form__error" role="alert">
                      {draft.error}
                    </p>
                  ) : null}
                  <button type="button" className="button button--small" onClick={() => addFloor(category)}>
                    {floors.length > 0 ? "Add another floor" : "Add floor"}
                  </button>
                </div>

              </fieldset>
            );
          })}
        </div>
      ) : null}

      {reviewError ? (
        <p className="form__error" role="alert">
          {reviewError}
        </p>
      ) : null}
      <button type="submit" className="button" disabled={busy}>
        {busy ? "Saving..." : editing ? "Save project" : "Review project"}
      </button>
      </div>

      {review ? <ReviewPanel body={review} managers={managers} busy={busy} onBack={() => setReview(null)} onConfirm={() => void send(review)} /> : null}

      {error ? (
        <p className="form__error" role="alert">
          {error}
        </p>
      ) : null}
      {done && !error ? (
        <p className="form__success">{editing ? "Project updated." : "Project confirmed. It is now live and ready for sales."}</p>
      ) : null}
    </form>
  );
}

/** The last step of creating a project: everything on one page; nothing is saved until the Super Admin confirms. */
function ReviewPanel({
  body,
  managers,
  busy,
  onBack,
  onConfirm,
}: {
  body: ProjectPayload;
  managers: ManagerView[];
  busy: boolean;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const highRise = body.type === "high-rise";
  const manager = managers.find((m) => m.id === body.managerId)?.name ?? "None";
  const total = highRise ? body.units.length : (body.totalUnits ?? body.rates.reduce((sum, r) => sum + (r.units ?? 0), 0));

  return (
    <div className="review">
      <h3 className="form__subtitle">Check the project before it goes live</h3>
      <dl className="review__facts">
        <div><dt>Project</dt><dd>{body.name}</dd></div>
        <div><dt>Location</dt><dd>{body.location}</dd></div>
        <div><dt>Type</dt><dd>{highRise ? "High-rise (per sq ft)" : "Land plotting (per marla)"}</dd></div>
        <div><dt>Status</dt><dd>{body.status.replace("-", " ")}</dd></div>
        <div><dt>Start date</dt><dd>{body.startDate}</dd></div>
        <div><dt>Budget</dt><dd>{formatMoney(body.budget)}</dd></div>
        <div><dt>Manager</dt><dd>{manager}</dd></div>
        <div><dt>Total units</dt><dd>{formatNumber(total)}</dd></div>
      </dl>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Plot type</th>
              <th className="num">Price {highRise ? "per sq ft" : "per marla"}</th>
              <th className="num">Units</th>
              {highRise ? <th>Floors</th> : null}
            </tr>
          </thead>
          <tbody>
            {body.rates.map((rate) => {
              const own = body.units.filter((u) => u.category === rate.category);
              const floors = [...new Set(own.map((u) => u.floor))];
              return (
                <tr key={rate.category}>
                  <td>{categoryLabels[rate.category]}</td>
                  <td className="num">{formatMoney(rate.rate)}</td>
                  <td className="num">{highRise ? own.length : (rate.units ?? "-")}</td>
                  {highRise ? (
                    <td>
                      {floors.length
                        ? floors.map((f) => `Floor ${f}: ${own.filter((u) => u.floor === f).length}`).join(" · ")
                        : "-"}
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="row-actions">
        <button type="button" className="button button--ghost" onClick={onBack} disabled={busy}>
          Back to edit
        </button>
        <button type="button" className="button" onClick={onConfirm} disabled={busy}>
          {busy ? "Saving..." : "Confirm and make live"}
        </button>
      </div>
    </div>
  );
}
