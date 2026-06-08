/** Shared Redmine types */

export interface RedmineUser {
  id: number;
  login: string;
  firstname: string;
  lastname: string;
  mail: string;
}

export interface RedmineActivity {
  id: number;
  name: string;
  is_default?: boolean;
}

export interface RedmineIssue {
  id: number;
  subject: string;
  project?: { id: number; name: string };
  parent?: { id: number; subject?: string };
}

export interface RedmineTimeEntry {
  id: number;
  spent_on: string;     // "YYYY-MM-DD"
  hours: number;
  comments: string;
  activity: { id: number; name: string };
  issue?: { id: number; name?: string; parentId?: number };
  project?: { id: number; name: string };
  user?: { id: number; name: string };
}

export interface AppConfig {
  redmineUrl: string;
  apiToken: string;
}
