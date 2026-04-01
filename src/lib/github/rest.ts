import { gh } from './client.js';
import type { Issue, CreateIssueParams, UpdateIssueParams } from '../../types/issue.js';
import { getDefaultRepo } from '../config.js';

export class RestAPI {
  public readonly owner: string;
  public readonly repo: string;

  constructor(owner?: string, repo?: string) {
    if (owner && repo) {
      this.owner = owner;
      this.repo = repo;
    } else {
      const current = gh.getCurrentRepo();
      if (!current) {
        throw new Error('Could not determine repository. Use --repo owner/repo or run from a git repository.');
      }
      this.owner = current.owner;
      this.repo = current.repo;
    }
  }

  static fromRepoString(repoStr?: string): RestAPI {
    // Priority: CLI option > config default > git detection
    const effectiveRepo = repoStr || getDefaultRepo();

    if (effectiveRepo) {
      const [owner, repo] = effectiveRepo.split('/');
      if (!owner || !repo) {
        throw new Error('Invalid repository format. Use owner/repo format.');
      }
      return new RestAPI(owner, repo);
    }
    return new RestAPI();
  }

  async listIssues(options: {
    state?: 'open' | 'closed' | 'all';
    labels?: string[];
    assignee?: string;
    per_page?: number;
  } = {}): Promise<Issue[]> {
    const params = new URLSearchParams();

    if (options.state) params.append('state', options.state);
    if (options.labels && options.labels.length > 0) {
      params.append('labels', options.labels.join(','));
    }
    if (options.assignee) params.append('assignee', options.assignee);
    if (options.per_page) params.append('per_page', String(options.per_page));

    const queryString = params.toString();
    const endpoint = `/repos/${this.owner}/${this.repo}/issues${queryString ? `?${queryString}` : ''}`;

    const result = await gh.api<Issue[]>(endpoint);
    // Filter out pull requests (they also appear in issues endpoint)
    return (result ?? []).filter(issue => !('pull_request' in issue));
  }

  async getIssue(number: number): Promise<Issue> {
    return gh.api<Issue>(`/repos/${this.owner}/${this.repo}/issues/${number}`);
  }

  async createIssue(params: CreateIssueParams): Promise<Issue> {
    const args = ['issue', 'create', '--repo', `${this.owner}/${this.repo}`];

    args.push('--title', params.title);

    args.push('--body', params.body || ' ');

    if (params.labels && params.labels.length > 0) {
      for (const label of params.labels) {
        args.push('--label', label);
      }
    }

    if (params.assignees && params.assignees.length > 0) {
      for (const assignee of params.assignees) {
        args.push('--assignee', assignee);
      }
    }

    if (params.milestone) {
      args.push('--milestone', String(params.milestone));
    }

    const result = await gh.exec(args);
    // gh issue create returns the URL of the created issue
    const url = result.stdout.trim();
    const match = url.match(/\/issues\/(\d+)$/);
    if (match) {
      return this.getIssue(Number(match[1]));
    }
    throw new Error('Failed to get created issue');
  }

  async updateIssue(number: number, params: UpdateIssueParams): Promise<Issue> {
    const args = ['issue', 'edit', String(number), '--repo', `${this.owner}/${this.repo}`];

    if (params.title) {
      args.push('--title', params.title);
    }

    if (params.body) {
      args.push('--body', params.body);
    }

    if (params.labels && params.labels.length > 0) {
      args.push('--add-label', params.labels.join(','));
    }

    if (params.assignees && params.assignees.length > 0) {
      args.push('--add-assignee', params.assignees.join(','));
    }

    if (params.milestone !== undefined) {
      if (params.milestone === null) {
        args.push('--remove-milestone');
      } else {
        args.push('--milestone', String(params.milestone));
      }
    }

    await gh.exec(args);
    return this.getIssue(number);
  }

  async closeIssue(number: number, comment?: string): Promise<Issue> {
    const args = ['issue', 'close', String(number), '--repo', `${this.owner}/${this.repo}`];

    if (comment) {
      args.push('--comment', comment);
    }

    await gh.exec(args);
    return this.getIssue(number);
  }

  async reopenIssue(number: number): Promise<Issue> {
    await gh.exec(['issue', 'reopen', String(number), '--repo', `${this.owner}/${this.repo}`]);
    return this.getIssue(number);
  }

  async addComment(number: number, body: string): Promise<void> {
    await gh.exec(['issue', 'comment', String(number), '--repo', `${this.owner}/${this.repo}`, '--body', body]);
  }

  async addLabels(number: number, labels: string[]): Promise<void> {
    await gh.exec(['issue', 'edit', String(number), '--repo', `${this.owner}/${this.repo}`, '--add-label', labels.join(',')]);
  }

  async removeLabels(number: number, labels: string[]): Promise<void> {
    await gh.exec(['issue', 'edit', String(number), '--repo', `${this.owner}/${this.repo}`, '--remove-label', labels.join(',')]);
  }
}
