import "server-only";

import type { AssignmentStatus, AttendanceRecord, Worker, WorkAssignment } from "@/models/hr";
import type { HrRepository } from "@/repositories/contracts";
import { run, select, selectOne, type Row } from "./db";

const WORKER_COLUMNS = `id, project_id AS projectId, name, type, role, phone,
  monthly_salary AS monthlySalary, daily_wage AS dailyWage, active`;
const ASSIGNMENT_COLUMNS = "id, project_id AS projectId, worker_id AS workerId, task, status, due_date AS dueDate";

const decodeWorker = (row: Row) => ({ ...(row as unknown as Worker), active: Boolean(row.active) });
const decodeAttendance = (row: Row) => row as unknown as AttendanceRecord;
const decodeAssignment = (row: Row) => row as unknown as WorkAssignment;

export class MysqlHrRepository implements HrRepository {
  async listWorkers(projectId: string) {
    const rows = await select(`SELECT ${WORKER_COLUMNS} FROM workers WHERE project_id = ? ORDER BY name`, [projectId]);
    return rows.map(decodeWorker);
  }
  async findWorker(id: string) {
    const row = await selectOne(`SELECT ${WORKER_COLUMNS} FROM workers WHERE id = ?`, [id]);
    return row ? decodeWorker(row) : null;
  }
  async saveWorker(worker: Worker) {
    await run(
      `INSERT INTO workers (id, project_id, name, type, role, phone, monthly_salary, daily_wage, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), type = VALUES(type), role = VALUES(role), phone = VALUES(phone),
         monthly_salary = VALUES(monthly_salary), daily_wage = VALUES(daily_wage), active = VALUES(active)`,
      [worker.id, worker.projectId, worker.name, worker.type, worker.role, worker.phone, worker.monthlySalary, worker.dailyWage, worker.active ? 1 : 0],
    );
    return worker;
  }
  /** Attendance and assignments go with the worker through ON DELETE CASCADE. */
  async removeWorker(id: string) {
    return (await run("DELETE FROM workers WHERE id = ?", [id])).affectedRows > 0;
  }
  async listAttendance(projectId: string) {
    const rows = await select(
      `SELECT a.id, a.worker_id AS workerId, a.att_date AS date, a.status
       FROM attendance a JOIN workers w ON w.id = a.worker_id WHERE w.project_id = ? ORDER BY a.att_date`,
      [projectId],
    );
    return rows.map(decodeAttendance);
  }
  async saveAttendance(record: AttendanceRecord) {
    await run(
      `INSERT INTO attendance (id, worker_id, att_date, status) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE att_date = VALUES(att_date), status = VALUES(status)`,
      [record.id, record.workerId, record.date, record.status],
    );
    return record;
  }
  async listAssignments(projectId: string) {
    const rows = await select(`SELECT ${ASSIGNMENT_COLUMNS} FROM assignments WHERE project_id = ? ORDER BY due_date`, [projectId]);
    return rows.map(decodeAssignment);
  }
  async saveAssignment(assignment: WorkAssignment) {
    await run(
      `INSERT INTO assignments (id, project_id, worker_id, task, status, due_date) VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE task = VALUES(task), status = VALUES(status), due_date = VALUES(due_date)`,
      [assignment.id, assignment.projectId, assignment.workerId, assignment.task, assignment.status, assignment.dueDate],
    );
    return assignment;
  }
  async setAssignmentStatus(id: string, status: AssignmentStatus) {
    await run("UPDATE assignments SET status = ? WHERE id = ?", [status, id]);
    const row = await selectOne(`SELECT ${ASSIGNMENT_COLUMNS} FROM assignments WHERE id = ?`, [id]);
    return row ? decodeAssignment(row) : null;
  }
}
