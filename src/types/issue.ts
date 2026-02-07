export interface Issue {
  number: number;
  title: string;
  state: 'open' | 'closed';
  body: string | null;
  labels: Label[];
  assignees: User[];
  milestone: Milestone | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  html_url: string;
  user: User;
}

export interface Label {
  id: number;
  name: string;
  color: string;
  description: string | null;
}

export interface User {
  login: string;
  id: number;
  avatar_url: string;
  html_url: string;
}

export interface Milestone {
  number: number;
  title: string;
  state: 'open' | 'closed';
}

export interface CreateIssueParams {
  title: string;
  body?: string;
  labels?: string[];
  assignees?: string[];
  milestone?: number;
}

export interface UpdateIssueParams {
  title?: string;
  body?: string;
  state?: 'open' | 'closed';
  labels?: string[];
  assignees?: string[];
  milestone?: number | null;
}
