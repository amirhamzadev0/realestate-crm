import "server-only";

import type { ChangeRequest } from "@/models/changes";
import type { ChangeRequestRepository } from "@/repositories/contracts";
import { run, select, selectOne, where, type Row } from "./db";

const COLUMNS = `id, kind, action, project_id AS projectId, target_id AS targetId, target_name AS targetName,
  payload, requested_by AS requestedBy, created_at AS createdAt, status, decision_note AS decisionNote,
  decided_at AS decidedAt`;

function decode(row: Row): ChangeRequest {
  const { decisionNote, decidedAt, payload, ...rest } = row as unknown as ChangeRequest;
  return {
    ...rest,
    // mysql2 parses JSON columns, but a driver or proxy that returns text must not break reads.
    payload: typeof payload === "string" ? (JSON.parse(payload) as Record<string, unknown>) : (payload ?? null),
    ...(decisionNote != null ? { decisionNote } : {}),
    ...(decidedAt != null ? { decidedAt } : {}),
  };
}

export class MysqlChangeRequestRepository implements ChangeRequestRepository {
  async list(filter?: { projectId?: string; status?: ChangeRequest["status"]; kind?: ChangeRequest["kind"] }) {
    const { clause, params } = where([
      { sql: "project_id = ?", value: filter?.projectId, when: !!filter?.projectId },
      { sql: "status = ?", value: filter?.status, when: !!filter?.status },
      { sql: "kind = ?", value: filter?.kind, when: !!filter?.kind },
    ]);
    const rows = await select(`SELECT ${COLUMNS} FROM change_requests${clause} ORDER BY created_at DESC, inserted_at DESC`, params);
    return rows.map(decode);
  }
  async find(id: string) {
    const row = await selectOne(`SELECT ${COLUMNS} FROM change_requests WHERE id = ?`, [id]);
    return row ? decode(row) : null;
  }
  async save(request: ChangeRequest) {
    await run(
      `INSERT INTO change_requests
         (id, kind, action, project_id, target_id, target_name, payload, requested_by, created_at, status, decision_note, decided_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE status = VALUES(status), decision_note = VALUES(decision_note), decided_at = VALUES(decided_at)`,
      [
        request.id,
        request.kind,
        request.action,
        request.projectId,
        request.targetId,
        request.targetName,
        request.payload ? JSON.stringify(request.payload) : null,
        request.requestedBy,
        request.createdAt,
        request.status,
        request.decisionNote ?? null,
        request.decidedAt ?? null,
      ],
    );
    return request;
  }
}
