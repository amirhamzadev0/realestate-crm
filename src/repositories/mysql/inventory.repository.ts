import "server-only";

import type { Delivery, Material, OrderPayment, MaterialRequest, RequestStatus, StockItem } from "@/models/inventory";
import type { InventoryRepository } from "@/repositories/contracts";
import { run, select, selectOne, where, type Row } from "./db";

const STOCK_COLUMNS = `s.id, s.project_id AS projectId, s.material_id AS materialId,
  s.quantity, s.used, s.min_level AS minLevel`;
const REQUEST_COLUMNS = `id, project_id AS projectId, material_id AS materialId, quantity, note,
  requested_by AS requestedBy, created_at AS createdAt, status, decision_note AS decisionNote, decided_at AS decidedAt,
  ordered_at AS orderedAt, received_at AS receivedAt, vendor, total_amount AS totalAmount, payment_terms AS paymentTerms,
  amount_paid AS amountPaid, paid_at AS paidAt, deliveries, payments`;

const decodeMaterial = (row: Row) => row as unknown as Material;
const decodeStock = (row: Row) => row as unknown as StockItem;

/** NULL decision columns are left out, matching the mock data where the keys are simply absent. */
function decodeRequest(row: Row): MaterialRequest {
  const { decisionNote, decidedAt, orderedAt, receivedAt, vendor, totalAmount, paymentTerms, paidAt, deliveries, payments, ...rest } = row as unknown as MaterialRequest;
  return {
    ...rest,
    ...(decisionNote != null ? { decisionNote } : {}),
    ...(decidedAt != null ? { decidedAt } : {}),
    ...(orderedAt != null ? { orderedAt } : {}),
    ...(receivedAt != null ? { receivedAt } : {}),
    ...(vendor != null ? { vendor } : {}),
    ...(totalAmount != null ? { totalAmount: Number(totalAmount) } : {}),
    ...(paymentTerms != null ? { paymentTerms } : {}),
    ...(paidAt != null ? { paidAt } : {}),
    ...(payments != null ? { payments: (typeof payments === "string" ? JSON.parse(payments) : payments) as OrderPayment[] } : {}),
    ...(deliveries != null ? { deliveries: (typeof deliveries === "string" ? JSON.parse(deliveries) : deliveries) as Delivery[] } : {}),
  };
}

export class MysqlInventoryRepository implements InventoryRepository {
  async listMaterials() {
    return (await select("SELECT id, name, category, unit FROM materials ORDER BY name")).map(decodeMaterial);
  }
  async saveMaterial(material: Material) {
    await run(
      `INSERT INTO materials (id, name, category, unit) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), category = VALUES(category), unit = VALUES(unit)`,
      [material.id, material.name, material.category, material.unit],
    );
    return material;
  }
  async listStock(projectId: string) {
    const rows = await select(
      `SELECT ${STOCK_COLUMNS} FROM stock_items s JOIN materials m ON m.id = s.material_id WHERE s.project_id = ? ORDER BY m.name`,
      [projectId],
    );
    return rows.map(decodeStock);
  }
  async findStock(projectId: string, materialId: string) {
    const row = await selectOne(`SELECT ${STOCK_COLUMNS} FROM stock_items s WHERE s.project_id = ? AND s.material_id = ?`, [projectId, materialId]);
    return row ? decodeStock(row) : null;
  }
  async saveStock(item: StockItem) {
    await run(
      `INSERT INTO stock_items (id, project_id, material_id, quantity, used, min_level)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE quantity = VALUES(quantity), used = VALUES(used), min_level = VALUES(min_level)`,
      [item.id, item.projectId, item.materialId, item.quantity, item.used, item.minLevel],
    );
    return item;
  }
  async listRequests(filter?: { projectId?: string; status?: RequestStatus }) {
    const { clause, params } = where([
      { sql: "project_id = ?", value: filter?.projectId, when: !!filter?.projectId },
      { sql: "status = ?", value: filter?.status, when: !!filter?.status },
    ]);
    const rows = await select(
      `SELECT ${REQUEST_COLUMNS} FROM material_requests${clause} ORDER BY created_at DESC, inserted_at DESC`,
      params,
    );
    return rows.map(decodeRequest);
  }
  async findRequest(id: string) {
    const row = await selectOne(`SELECT ${REQUEST_COLUMNS} FROM material_requests WHERE id = ?`, [id]);
    return row ? decodeRequest(row) : null;
  }
  async saveRequest(request: MaterialRequest) {
    await run(
      `INSERT INTO material_requests
         (id, project_id, material_id, quantity, note, requested_by, created_at, status, decision_note, decided_at, ordered_at, received_at,
          vendor, total_amount, payment_terms, amount_paid, paid_at, deliveries, payments)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE status = VALUES(status), decision_note = VALUES(decision_note), decided_at = VALUES(decided_at),
         ordered_at = VALUES(ordered_at), received_at = VALUES(received_at),
         vendor = VALUES(vendor), total_amount = VALUES(total_amount), payment_terms = VALUES(payment_terms),
         amount_paid = VALUES(amount_paid), paid_at = VALUES(paid_at), deliveries = VALUES(deliveries), payments = VALUES(payments)`,
      [
        request.id,
        request.projectId,
        request.materialId,
        request.quantity,
        request.note,
        request.requestedBy,
        request.createdAt,
        request.status,
        request.decisionNote ?? null,
        request.decidedAt ?? null,
        request.orderedAt ?? null,
        request.receivedAt ?? null,
        request.vendor ?? null,
        request.totalAmount ?? null,
        request.paymentTerms ?? null,
        request.amountPaid ?? 0,
        request.paidAt ?? null,
        request.deliveries ? JSON.stringify(request.deliveries) : null,
        request.payments ? JSON.stringify(request.payments) : null,
      ],
    );
    return request;
  }
}
