/** A project manager. Each manager runs at most one project; the Super Admin creates and edits them. */
export interface Manager {
  id: string;
  name: string;
  phone: string;
  email: string;
  active: boolean;
}

export interface ManagerView extends Manager {
  projectId: string | null;
  projectName: string | null;
}
