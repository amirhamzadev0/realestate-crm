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
  dueDate: string; // ISO date
}

export interface WorkerView extends Worker {
  daysWorked: number; // this month
  earned: number; // salary or daily wage x days
  tasks: WorkAssignment[];
}

export interface HrSummary {
  employees: number;
  labour: number;
  monthlyPayroll: number; // projected: salaries + wages earned so far
}
