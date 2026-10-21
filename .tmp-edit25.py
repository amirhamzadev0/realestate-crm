import json
def sub(p,a,b,count=1):
    s=open(p,encoding='utf8').read()
    assert a in s,(p,a)
    open(p,'w',encoding='utf8').write(s.replace(a,b,count))
def write(p,t):
    open(p,'w',encoding='utf8').write(t)

# ---- project model: units replace floors
p='src/models/project.ts'
s=open(p,encoding='utf8').read()
a=s.index('/** How many units a floor of a high-rise has. */')
b=s.index('export type ProjectStatus')
s=s[:a]+'''/** One unit of a high-rise: its plot type, the floor it is on, its number and its size in sq ft. */
export interface ProjectUnit {
  category: PlotCategory;
  floor: string; // "1", "G", "Mezzanine" ...
  unit: string; // unique inside the project
  area: number;
}

'''+s[b:]
s=s.replace('  floors: ProjectFloor[]; // high-rise only; when set, the units add up to totalUnits','  units: ProjectUnit[]; // high-rise only: every unit with its type, floor and size; totalUnits is their count')
s=s.replace('  units?: number; // how many units of this category the project has; left out when not counted','  units?: number; // how many units of this category the project has (counted from `units` for a high-rise)')
write(p,s)

# ---- sale model
p='src/models/sales.ts'
sub(p,'import type { PlotCategory } from "@/models/project";','import type { PlotCategory } from "@/models/project";\nimport type { DiscountMode } from "@/utils/pricing";')
sub(p,'  rate: number; // the project\'s rate when the sale was made\n  price: number; // area x rate','  rate: number; // the project\'s list rate when the sale was made\n  listPrice: number; // area x rate\n  discountMode?: Exclude<DiscountMode, "none">; // set when the Super Admin gave a discount\n  discountValue?: number; // the amount, the discounted rate or the percentage, as entered\n  discountAmount?: number; // listPrice - price\n  price: number; // what the buyer pays; this is what the project is credited')

# ---- project service
p='src/services/project.service.ts'
sub(p,'import { plotCategories, type Project, type ProjectFloor, type ProjectRate, type ProjectType } from "@/models/project";','import { plotCategories, type Project, type ProjectRate, type ProjectType, type ProjectUnit } from "@/models/project";')
sub(p,'''const floorSchema = z.object({
  floor: z.string().trim().min(1).max(20),
  units: z.number().int().min(1).max(SAFE_MAX),
});''','''const unitSchema = z.object({
  category: z.enum(plotCategories),
  floor: z.string().trim().min(1).max(20),
  unit: z.string().trim().min(1).max(60),
  area: z.number().positive().max(10_000_000),
});''')
sub(p,'  floors: z.array(floorSchema).default([]),','  units: z.array(unitSchema).default([]),')
s=open(p,encoding='utf8').read()
i=s.index('/**\n * Checks the price table, the units per plot type')
j=s.index('export class ProjectService')
new='''/**
 * Checks the price table and the units, and settles the total units.
 * - Land plotting: every plot type on offer needs its number of plots, and the total is their sum.
 * - High-rise: the units are listed one by one (type, floor, number, size); the number of units of each type and
 *   the total are counted from that list, and a type with units needs a price.
 */
function layout(
  type: ProjectType,
  input: { rates: ProjectRate[]; units: ProjectUnit[]; totalUnits?: number },
): { rates: ProjectRate[]; units: ProjectUnit[]; totalUnits: number } {
  const { rates } = input;
  if (new Set(rates.map((r) => r.category)).size !== rates.length) {
    throw new AppError("Each plot type can have only one price", 400);
  }

  if (type === "land-plotting") {
    const counted = rates.filter((r) => r.units !== undefined).length;
    if (counted !== rates.length) throw new AppError("Enter how many commercial, residential or general plots there are", 400);
    const onTypes = rates.reduce((sum, r) => sum + (r.units ?? 0), 0);
    const totalUnits = input.totalUnits ?? onTypes;
    if (totalUnits !== onTypes) {
      throw new AppError(`Total units (${totalUnits}) must equal the units of all plot types (${onTypes})`, 400);
    }
    return { rates, units: [], totalUnits };
  }

  const units = input.units;
  if (units.length === 0) throw new AppError("Add the units of this high-rise: plot type, floor, unit number and size", 400);
  if (new Set(units.map((u) => u.unit.toLowerCase())).size !== units.length) {
    const seen = new Set<string>();
    const duplicate = units.find((u) => (seen.has(u.unit.toLowerCase()) ? true : (seen.add(u.unit.toLowerCase()), false)));
    throw new AppError(`Unit ${duplicate?.unit} is listed twice. Every unit number must be different.`, 400);
  }
  for (const category of new Set(units.map((u) => u.category))) {
    if (!rates.some((r) => r.category === category)) throw new AppError(`Set a price for the ${category} units`, 400);
  }
  if (input.totalUnits !== undefined && input.totalUnits !== units.length) {
    throw new AppError(`Total units (${input.totalUnits}) must equal the number of units listed (${units.length})`, 400);
  }
  // The price table keeps only the types that have units, each with its count.
  const counted = rates
    .map((r) => ({ ...r, units: units.filter((u) => u.category === r.category).length }))
    .filter((r) => r.units > 0);
  return { rates: counted, units, totalUnits: units.length };
}

'''
s=s[:i]+new+s[j:]
s=s.replace('const { totalUnits, rates, floors, ...data } = projectSchema.parse(input);\n    const settled = layout(data.type, { rates, floors, totalUnits });','const { totalUnits, rates, units, ...data } = projectSchema.parse(input);\n    const settled = layout(data.type, { rates, units, totalUnits });',1)
s=s.replace('const { totalUnits, rates, floors, ...data } = projectSchema.omit({ type: true }).parse(input);\n    const settled = layout(existing.type, { rates, floors, totalUnits });','const { totalUnits, rates, units, ...data } = projectSchema.omit({ type: true }).parse(input);\n    const settled = layout(existing.type, { rates, units, totalUnits });',1)
a=s.index('  /** Units already sold must still fit')
b=s.index('  async listManagers()')
new2='''  /** What is already sold must still fit: enough units, in the same plot type, and listed units not removed. */
  private async assertRoomForSales(
    project: Project,
    next: { rates: ProjectRate[]; units: ProjectUnit[]; totalUnits: number },
  ): Promise<void> {
    if (!this.sales) return;
    const sold = (await this.sales.listSales()).filter((s) => s.projectId === project.id);
    if (next.totalUnits < sold.length) {
      throw new AppError(`${sold.length} units are already sold, so total units cannot be ${next.totalUnits}`, 409);
    }
    for (const sale of sold) {
      if (!next.rates.some((r) => r.category === sale.category)) {
        throw new AppError(`${sale.category} units are already sold, so that plot type cannot be removed`, 409);
      }
    }
    if (next.units.length) {
      for (const sale of sold) {
        const unit = next.units.find((u) => u.unit.toLowerCase() === sale.unit.toLowerCase());
        if (!unit || unit.category !== sale.category) {
          throw new AppError(`Unit ${sale.unit} is already sold, so it cannot be removed or moved to another plot type`, 409);
        }
      }
      return;
    }
    for (const rate of next.rates) {
      const soldOfType = sold.filter((s) => s.category === rate.category).length;
      if (rate.units !== undefined && rate.units < soldOfType) {
        throw new AppError(`${soldOfType} ${rate.category} units are already sold, so there cannot be only ${rate.units}`, 409);
      }
    }
  }

'''
s=s[:a]+new2+s[b:]
write(p,s)
print("part A ok")
