import { describe, it, expect } from 'vitest';
import { formatIssueList, formatProjectList } from '../src/lib/output.js';
import type { Issue } from '../src/types/issue.js';
import type { Project } from '../src/types/project.js';

describe('formatIssueList', () => {
  it('returns message for empty list', () => {
    const result = formatIssueList([], 'table');
    expect(result).toContain('No issues found');
  });

  it('returns JSON for json format', () => {
    const issues: Issue[] = [{
      number: 1,
      title: 'Test Issue',
      state: 'open',
      body: 'Test body',
      labels: [],
      assignees: [],
      milestone: null,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-02T00:00:00Z',
      closed_at: null,
      html_url: 'https://github.com/test/test/issues/1',
      user: { login: 'testuser', id: 1, avatar_url: '', html_url: '' },
    }];

    const result = formatIssueList(issues, 'json');
    const parsed = JSON.parse(result);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].number).toBe(1);
    expect(parsed[0].title).toBe('Test Issue');
  });

  it('formats table with issue data', () => {
    const issues: Issue[] = [{
      number: 42,
      title: 'Bug fix',
      state: 'open',
      body: null,
      labels: [{ id: 1, name: 'bug', color: 'red', description: null }],
      assignees: [],
      milestone: null,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-02T00:00:00Z',
      closed_at: null,
      html_url: 'https://github.com/test/test/issues/42',
      user: { login: 'testuser', id: 1, avatar_url: '', html_url: '' },
    }];

    const result = formatIssueList(issues, 'table');
    expect(result).toContain('#42');
    expect(result).toContain('Bug fix');
    expect(result).toContain('bug');
  });
});

describe('formatProjectList', () => {
  it('returns message for empty list', () => {
    const result = formatProjectList([], 'table');
    expect(result).toContain('No projects found');
  });

  it('returns JSON for json format', () => {
    const projects: Project[] = [{
      id: 'PVT_123',
      number: 1,
      title: 'Test Project',
      shortDescription: 'A test project',
      url: 'https://github.com/users/test/projects/1',
      closed: false,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-02T00:00:00Z',
      owner: { login: 'testuser' },
    }];

    const result = formatProjectList(projects, 'json');
    const parsed = JSON.parse(result);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].number).toBe(1);
    expect(parsed[0].title).toBe('Test Project');
  });
});
