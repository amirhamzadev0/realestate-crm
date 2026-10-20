export type WorkerType = "employee" | "labour";

export interface Worker {
  id: string;
  projectId: string;
  name: string;
  type: WorkerType;
  role: string; // site engineer, mason, electrician ...
  phone: string;
  monthlySalary: number; // employees (0 for labour)
  dailyWage: number; // labour (0 for employees)
  active: boolean;
  joinedAt: string; // ISO date; monthly salary falls due one month after this, then every month
}

export type AttendanceStatus = "present" | "absent" | "half-day";

export interface AttendanceRecord {
  id: string;
  workerId: string;
  date: string; // ISO date
  status: AttendanceStatus;
}

export type AssignmentStatus = "todo" | "in-progress" | "done";

export interface WorkAssignment {
  id: string;
  projectId: string;
  workerId: string;
  task: string;
  status: AssignmentStatus;
  assignedAt: string; // ISO date the manager gave the task
  dueDate: string; // ISO date
  payment: number; // PKR owed to the worker once the task is done
  completedAt?: string; // ISO date, set when the task is marked done
}

export interface WorkerView extends Worker {
  daysWorked: number; // this month
  earned: number; // salary or daily wage x days
  tasks: WorkAssignment[];
}

export interface HrSummary {
  employees: number;
  labour: number;
  monthlyPayroll: number; // paid out this month: what the Super Admin has actually handed over
  pendingPayroll: number; // due but not paid yet
  pendingCount: number;
}

/** A payment the Super Admin has made. `ref` is the salary cycle number or the task id. */
export interface PayrollPayment {
  id: string;
  projectId: string;
  workerId: string;
  kind: "salary" | "task";
  ref: string;
  amount: number;
  paidAt: string; // ISO date
}

/** Money owed to a person: a monthly salary that has come due, or a task that is done. */
export interface PayrollItem {
  kind: "salary" | "task";
  ref: string;
  projectId: string;
  workerId: string;
  workerName: string;
  workerType: WorkerType;
  description: string;
  dueDate: string; // ISO date it became payable
  amount: number;
  paidAt?: string;
}

/** One day of completed work, for the daily report. */
export interface DaySummary {
  date: string;
  count: number;
  total: number;
}
