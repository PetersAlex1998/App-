import { DB, Property, Tenant, Unit } from './types';
import { NkResult, nkStatement, vatFactor } from './calc';

export interface NkRow {
  tenant: Tenant; unit: Unit; res: NkResult; hasCosts: boolean; done?: string;
}
export interface NkOverview {
  rows: NkRow[];
  totalCosts: number; // alle erfassten Kosten des Hauses (netto)
  allocated: number; // auf Mieter umgelegt (netto)
  notAllocated: number; // Anteil des Eigentümers (Leerstand u. Ä.)
  advances: number; balance: number;
  warnings: string[];
}

/** Mieter, die im Jahr im Haus gewohnt haben. */
export function occupants(db: DB, propertyId: string, year: number): { tenant: Tenant; unit: Unit }[] {
  const out: { tenant: Tenant; unit: Unit }[] = [];
  for (const unit of db.units.filter((u) => u.propertyId === propertyId)) {
    for (const tenant of db.tenants.filter((t) => t.unitId === unit.id)) {
      if (tenant.moveIn <= `${year}-12-31` && (!tenant.moveOut || tenant.moveOut >= `${year}-01-01`)) out.push({ tenant, unit });
    }
  }
  return out.sort((a, b) => a.unit.name.localeCompare(b.unit.name, 'de', { numeric: true }));
}

export function nkOverview(db: DB, prop: Property, year: number): NkOverview {
  const costs = db.costs.filter((c) => c.propertyId === prop.id && c.year === year);
  const totalCosts = costs.reduce((s, c) => s + c.amount, 0);
  const rows: NkRow[] = occupants(db, prop.id, year).map(({ tenant, unit }) => ({
    tenant, unit, res: nkStatement(db, tenant, unit, year), hasCosts: costs.length > 0, done: tenant.nkDone?.[String(year)],
  }));
  const allocated = rows.reduce((s, r) => s + r.res.lines.reduce((a, l) => a + l.share, 0) / vatFactor(r.unit), 0);
  const warnings = [...new Set(rows.flatMap((r) => r.res.warnings))];
  return {
    rows, totalCosts, allocated: Math.round(allocated * 100) / 100, notAllocated: Math.round((totalCosts - allocated) * 100) / 100,
    advances: rows.reduce((s, r) => s + r.res.advances, 0), balance: rows.reduce((s, r) => s + r.res.balance, 0), warnings,
  };
}

/** Offene Abrechnungen für das Vorjahr (Frist: 12 Monate nach Ende des Abrechnungsjahres). */
export function dueStatements(db: DB, now = new Date().toISOString().slice(0, 10)): { prop: Property; year: number; open: number; total: number; deadline: string }[] {
  const year = Number(now.slice(0, 4)) - 1;
  const out: { prop: Property; year: number; open: number; total: number; deadline: string }[] = [];
  for (const prop of db.properties) {
    if (!db.costs.some((c) => c.propertyId === prop.id && c.year === year)) continue;
    const occ = occupants(db, prop.id, year);
    const open = occ.filter((o) => !o.tenant.nkDone?.[String(year)]).length;
    if (open > 0) out.push({ prop, year, open, total: occ.length, deadline: `${year + 1}-12-31` });
  }
  return out;
}
