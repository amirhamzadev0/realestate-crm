import "server-only";

import type { Installment, InstallmentContact, InstallmentPayment } from "@/models/finance";
import type { FinanceRepository } from "@/repositories/contracts";
import { run, select, selectOne, transaction, where, type Row } from "./db";

const COLUMNS = `id, sale_id AS saleId, project_id AS projectId, seq, kind, amount, due_date AS dueDate, paid, paid_at AS paidAt,
  follow_up_on AS followUpOn, contacts, payments`;

/** NULL paid_at and follow-up day are left out, matching the mock data where the keys are simply absent. */
function decode(row: Row): Installment {
  const { paidAt, followUpOn, contacts, dueDate, payments, ...rest } = row as unknown as Installment & { contacts: unknown; payments: unknown };
  return {
    ...rest,
    dueDate: dueDate ?? null,
    contacts: (typeof contacts === "string" ? JSON.parse(contacts) : (contacts ?? [])) as InstallmentContact[],
    ...(payments != null ? { payments: (typeof payments === "string" ? JSON.parse(payments) : payments) as InstallmentPayment[] } : {}),
    ...(paidAt != null ? { paidAt } : {}),
    ...(followUpOn != null ? { followUpOn } : {}),
  };
}

export class MysqlFinanceRepository implements FinanceRepository {
  async list(filter?: { saleId?: string; projectId?: string }) {
    const { clause, params } = where([
      { sql: "sale_id = ?", value: filter?.saleId, when: !!filter?.saleId },
      { sql: "project_id = ?", value: filter?.projectId, when: !!filter?.projectId },
    ]);
    return (await select(`SELECT ${COLUMNS} FROM installments${clause} ORDER BY sale_id, seq`, params)).map(decode);
  }
  async find(id: string) {
    const row = await selectOne(`SELECT ${COLUMNS} FROM installments WHERE id = ?`, [id]);
    return row ? decode(row) : null;
  }
  /** All the items are saved together or not at all. */
  async saveAll(items: Installment[]) {
    await transaction(async (exec) => {
      for (const i of items) {
        await exec(
          `INSERT INTO installments (id, sale_id, project_id, seq, kind, amount, due_date, paid, paid_at, follow_up_on, contacts, payments)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE seq = VALUES(seq), amount = VALUES(amount), due_date = VALUES(due_date), paid = VALUES(paid), paid_at = VALUES(paid_at),
             follow_up_on = VALUES(follow_up_on), contacts = VALUES(contacts), payments = VALUES(payments)`,
          [i.id, i.saleId, i.projectId, i.seq, i.kind, i.amount, i.dueDate, i.paid, i.paidAt ?? null, i.followUpOn ?? null, JSON.stringify(i.contacts), i.payments ? JSON.stringify(i.payments) : null],
        );
      }
    });
    return items;
  }
  async removeAll(ids: string[]) {
    if (ids.length === 0) return;
    await run(`DELETE FROM installments WHERE id IN (${ids.map(() => "?").join(", ")})`, ids);
  }
}
