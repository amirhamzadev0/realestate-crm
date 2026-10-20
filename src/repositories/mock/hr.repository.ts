import type { AssignmentStatus, AttendanceRecord, PayrollPayment, Worker, WorkAssignment } from "@/models/hr";
import type { HrRepository } from "@/repositories/contracts";
import { getStore, upsert } from "./store";

export class MockHrRepository implements HrRepository {
  async listWorkers(projectId: string) {
    return structuredClone(getStore().workers.filter((w) => w.projectId === projectId));
  }
  async findWorker(id: string) {
    const found = getStore().workers.find((w) => w.id === id);
    return found ? structuredClone(found) : null;
  }
  async saveWorker(worker: Worker) {
    return upsert(getStore().workers, worker);
  }
  async removeWorker(id: string) {
    const store = getStore();
    const before = store.workers.length;
    store.workers = store.workers.filter((w) => w.id !== id);
    store.assignments = store.assignments.filter((a) => a.workerId !== id);
    store.attendance = store.attendance.filter((a) => a.workerId !== id);
    store.payments = store.payments.filter((p) => p.workerId !== id);
    return store.workers.length < before;
  }
  async listAttendance(projectId: string) {
    const store = getStore();
    const ids = new Set(store.workers.filter((w) => w.projectId === projectId).map((w) => w.id));
    return structuredClone(store.attendance.filter((a) => ids.has(a.workerId)));
  }
  async saveAttendance(record: AttendanceRecord) {
    return upsert(getStore().attendance, record);
  }
  async listAssignments(projectId: string) {
    return structuredClone(getStore().assignments.filter((a) => a.projectId === projectId));
  }
  async saveAssignment(assignment: WorkAssignment) {
    return upsert(getStore().assignments, assignment);
  }
  async setAssignmentStatus(id: string, status: AssignmentStatus, completedAt: string | null) {
    const found = getStore().assignments.find((a) => a.id === id);
    if (!found) return null;
    found.status = status;
    if (completedAt) found.completedAt = completedAt;
    else delete found.completedAt;
    return structuredClone(found);
  }
  async listPayments(projectId: string) {
    return structuredClone(getStore().payments.filter((p) => p.projectId === projectId));
  }
  async savePayment(payment: PayrollPayment) {
    return upsert(getStore().payments, payment);
  }
  async removeAssignment(id: string) {
    const store = getStore();
    const before = store.assignments.length;
    store.assignments = store.assignments.filter((a) => a.id !== id);
    return store.assignments.length < before;
  }
}
