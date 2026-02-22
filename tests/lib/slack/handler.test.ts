import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createIssueFromTemplate,
  formatSlackResponse,
  handleListCommand,
  handleStatusCommand,
  handleMemoCommand,
  handleCloseCommand,
  handleDueDateCommand,
  handleSearchCommand,
  handleDashboardCommand,
  collectDashboardData,
  formatListResponse,
  formatStatusResponse,
  formatMemoResponse,
  formatCloseResponse,
  formatDueDateResponse,
  formatSearchResponse,
  formatDashboardResponse,
  formatHelpResponse,
  formatCommandError,
} from '../../../src/lib/slack/handler.js';
import { getConfig } from '../../../src/lib/config.js';
import { RestAPI } from '../../../src/lib/github/rest.js';
import { GraphQLAPI } from '../../../src/lib/github/graphql.js';
import { gh } from '../../../src/lib/github/client.js';
import { NotFoundError } from '../../../src/lib/errors.js';
import type {
  SlackIssueCreationResult,
  SlackListResult,
  SlackStatusResult,
  SlackMemoResult,
  SlackCloseResult,
  SlackDueDateResult,
  SlackSearchResult,
  SlackDashboardResult,
} from '../../../src/types/slack.js';
import type { ProjectItem } from '../../../src/types/project.js';

// Shared mock instance for the module-level GraphQLAPI (hoisted so vi.mock can access it)
const mockGraphqlInstance = vi.hoisted(() => ({
  getProjectItemsFiltered: vi.fn(),
  findItemByIssueNumber: vi.fn(),
  moveItem: vi.fn(),
  getProjectFields: vi.fn(),
  setItemFieldByValue: vi.fn(),
  addItemToProject: vi.fn(),
  getProject: vi.fn(),
} as Record<string, ReturnType<typeof vi.fn>>));

// Mock the github modules and config since handler uses them
vi.mock('../../../src/lib/github/rest.js', () => ({
  RestAPI: {
    fromRepoString: vi.fn(),
  },
}));

vi.mock('../../../src/lib/github/graphql.js', () => ({
  GraphQLAPI: vi.fn(() => mockGraphqlInstance),
}));

vi.mock('../../../src/lib/github/client.js', () => ({
  gh: {
    api: vi.fn(),
  },
}));

vi.mock('../../../src/lib/config.js', () => ({
  getConfig: vi.fn(() => ({
    defaults: { repo: null, owner: null, output: 'table', project: null, projectOwner: null },
    rules: {},
    slack: { botToken: null, appToken: null, channelId: null },
  })),
}));

beforeEach(() => {
  // Reset all mock methods on the shared GraphQLAPI instance
  for (const key of Object.keys(mockGraphqlInstance)) {
    mockGraphqlInstance[key].mockReset();
  }
});

describe('createIssueFromTemplate', () => {
  it('throws when defaults.repo is not configured', async () => {
    vi.mocked(getConfig).mockReturnValue({
      defaults: { repo: null, owner: null, output: 'table', project: null, projectOwner: null },
      rules: {} as any,
      slack: { botToken: null, appToken: null, channelId: null },
    });

    await expect(
      createIssueFromTemplate({ title: 'Test' }),
    ).rejects.toThrow('リポジトリが設定されていません');
  });
});

describe('formatSlackResponse', () => {
  it('formats a basic issue creation result', () => {
    const result: SlackIssueCreationResult = {
      issue: { number: 42, title: 'Test Issue', html_url: 'https://github.com/owner/repo/issues/42' },
    };

    const output = formatSlackResponse(result);
    expect(output).toContain('*Issue #42*');
    expect(output).toContain('Test Issue');
    expect(output).toContain('https://github.com/owner/repo/issues/42');
  });

  it('includes project info when added to project', () => {
    const result: SlackIssueCreationResult = {
      issue: { number: 10, title: 'Project Issue', html_url: 'https://github.com/o/r/issues/10' },
      project: {
        projectNumber: 1,
        projectName: 'My Board',
        itemId: 'PVTI_123',
        fieldsSet: [],
      },
    };

    const output = formatSlackResponse(result);
    expect(output).toContain('*My Board*');
    expect(output).toContain('追加しました');
  });

  it('shows field set failures', () => {
    const result: SlackIssueCreationResult = {
      issue: { number: 5, title: 'Test', html_url: 'https://github.com/o/r/issues/5' },
      project: {
        projectNumber: 1,
        projectName: 'Board',
        itemId: 'PVTI_456',
        fieldsSet: [{ field: 'Due Date', success: false, error: 'Field not found' }],
      },
    };

    const output = formatSlackResponse(result);
    expect(output).toContain('Due Date');
    expect(output).toContain('Field not found');
  });
});


// --- handleListCommand ---

describe('handleListCommand', () => {
  it('throws when project is not configured', async () => {
    vi.mocked(getConfig).mockReturnValue({
      defaults: { repo: null, owner: null, output: 'table', project: null, projectOwner: null },
      rules: {} as any,
      slack: { botToken: null, appToken: null, channelId: null },
    });

    await expect(handleListCommand()).rejects.toThrow('プロジェクトが設定されていません');
  });

  it('returns items from project', async () => {
    vi.mocked(getConfig).mockReturnValue({
      defaults: { repo: 'owner/repo', owner: 'owner', output: 'table', project: 1, projectOwner: null },
      rules: {} as any,
      slack: { botToken: null, appToken: null, channelId: null },
    });

    const mockItems = [
      {
        id: 'item1',
        type: 'ISSUE' as const,
        content: { number: 10, title: 'Task A', state: 'OPEN', url: 'https://github.com/o/r/issues/10' },
        fieldValues: [
          { field: { name: 'Status' }, value: 'Todo' },
          { field: { name: 'Due Date' }, value: '2026-03-01' },
        ],
      },
    ];

    mockGraphqlInstance.getProjectItemsFiltered.mockResolvedValue(mockItems);

    const result = await handleListCommand('2026-03-15');
    expect(result.items).toHaveLength(1);
    expect(result.items[0].issueNumber).toBe(10);
    expect(result.items[0].title).toBe('Task A');
    expect(result.items[0].status).toBe('Todo');
    expect(result.dueBefore).toBe('2026-03-15');
  });
});

// --- handleStatusCommand ---

describe('handleStatusCommand', () => {
  it('throws when project is not configured', async () => {
    vi.mocked(getConfig).mockReturnValue({
      defaults: { repo: null, owner: null, output: 'table', project: null, projectOwner: null },
      rules: {} as any,
      slack: { botToken: null, appToken: null, channelId: null },
    });

    await expect(handleStatusCommand(123, 'Done')).rejects.toThrow('プロジェクトが設定されていません');
  });

  it('throws NotFoundError when issue is not in project', async () => {
    vi.mocked(getConfig).mockReturnValue({
      defaults: { repo: 'owner/repo', owner: 'owner', output: 'table', project: 1, projectOwner: null },
      rules: {} as any,
      slack: { botToken: null, appToken: null, channelId: null },
    });

    mockGraphqlInstance.findItemByIssueNumber.mockResolvedValue(null);

    await expect(handleStatusCommand(999, 'Done')).rejects.toThrow(NotFoundError);
  });

  it('moves item and returns result', async () => {
    vi.mocked(getConfig).mockReturnValue({
      defaults: { repo: 'owner/repo', owner: 'owner', output: 'table', project: 1, projectOwner: null },
      rules: {} as any,
      slack: { botToken: null, appToken: null, channelId: null },
    });

    mockGraphqlInstance.findItemByIssueNumber.mockResolvedValue({ id: 'item-1' });
    mockGraphqlInstance.moveItem.mockResolvedValue(undefined);

    const result = await handleStatusCommand(123, 'Done');
    expect(result).toEqual({ issueNumber: 123, newStatus: 'Done' });
    expect(mockGraphqlInstance.moveItem).toHaveBeenCalledWith(1, 'item-1', 'Done');
  });
});

// --- handleMemoCommand ---

describe('handleMemoCommand', () => {
  it('throws when repo is not configured', async () => {
    vi.mocked(getConfig).mockReturnValue({
      defaults: { repo: null, owner: null, output: 'table', project: null, projectOwner: null },
      rules: {} as any,
      slack: { botToken: null, appToken: null, channelId: null },
    });

    await expect(handleMemoCommand(123, 'メモ内容')).rejects.toThrow('リポジトリが設定されていません');
  });

  it('appends content to existing issue body', async () => {
    vi.mocked(getConfig).mockReturnValue({
      defaults: { repo: 'owner/repo', owner: 'owner', output: 'table', project: 1, projectOwner: null },
      rules: {} as any,
      slack: { botToken: null, appToken: null, channelId: null },
    });

    const mockUpdateIssue = vi.fn().mockResolvedValue({});
    vi.mocked(RestAPI.fromRepoString).mockReturnValue({
      getIssue: vi.fn().mockResolvedValue({
        number: 123,
        title: 'Test Issue',
        html_url: 'https://github.com/o/r/issues/123',
        body: '既存の内容',
      }),
      updateIssue: mockUpdateIssue,
    } as any);

    const result = await handleMemoCommand(123, '追記メモ');
    expect(result).toEqual({
      issueNumber: 123,
      title: 'Test Issue',
      html_url: 'https://github.com/o/r/issues/123',
    });
    expect(mockUpdateIssue).toHaveBeenCalledWith(123, { body: '既存の内容\n\n追記メモ' });
  });

  it('sets body when issue body is empty', async () => {
    vi.mocked(getConfig).mockReturnValue({
      defaults: { repo: 'owner/repo', owner: 'owner', output: 'table', project: 1, projectOwner: null },
      rules: {} as any,
      slack: { botToken: null, appToken: null, channelId: null },
    });

    const mockUpdateIssue = vi.fn().mockResolvedValue({});
    vi.mocked(RestAPI.fromRepoString).mockReturnValue({
      getIssue: vi.fn().mockResolvedValue({
        number: 10,
        title: 'Empty Issue',
        html_url: 'https://github.com/o/r/issues/10',
        body: '',
      }),
      updateIssue: mockUpdateIssue,
    } as any);

    await handleMemoCommand(10, '初回メモ');
    expect(mockUpdateIssue).toHaveBeenCalledWith(10, { body: '初回メモ' });
  });
});

// --- フォーマッター ---

describe('formatListResponse', () => {
  it('formats empty list', () => {
    const result: SlackListResult = { items: [] };
    expect(formatListResponse(result)).toContain('タスクが見つかりませんでした');
  });

  it('formats empty list with date filter', () => {
    const result: SlackListResult = { items: [], dueBefore: '2026-03-15' };
    const output = formatListResponse(result);
    expect(output).toContain('タスクが見つかりませんでした');
    expect(output).toContain('2026-03-15');
  });

  it('formats list with items', () => {
    const result: SlackListResult = {
      items: [
        { issueNumber: 10, title: 'Task A', status: 'Todo', dueDate: '2026-03-01', url: 'https://github.com/o/r/issues/10' },
        { issueNumber: 11, title: 'Task B', status: 'In Progress', dueDate: null },
      ],
    };
    const output = formatListResponse(result);
    expect(output).toContain('📋 タスク一覧 - 2件');
    expect(output).toContain('#10');
    expect(output).toContain('Task A');
    expect(output).toContain('[Todo]');
    expect(output).toContain('2026-03-01');
    expect(output).toContain('#11');
    expect(output).toContain('[In Progress]');
  });
});

describe('formatStatusResponse', () => {
  it('formats status change result', () => {
    const result: SlackStatusResult = { issueNumber: 42, newStatus: 'Done' };
    const output = formatStatusResponse(result);
    expect(output).toContain('#42');
    expect(output).toContain('*Done*');
  });
});

describe('formatMemoResponse', () => {
  it('formats memo result', () => {
    const result: SlackMemoResult = {
      issueNumber: 10,
      title: 'My Issue',
      html_url: 'https://github.com/o/r/issues/10',
    };
    const output = formatMemoResponse(result);
    expect(output).toContain('#10');
    expect(output).toContain('メモを追記しました');
    expect(output).toContain('https://github.com/o/r/issues/10');
  });
});

// --- handleCloseCommand ---

describe('handleCloseCommand', () => {
  it('throws when repo is not configured', async () => {
    vi.mocked(getConfig).mockReturnValue({
      defaults: { repo: null, owner: null, output: 'table', project: null, projectOwner: null },
      rules: {} as any,
      slack: { botToken: null, appToken: null, channelId: null },
    });

    await expect(handleCloseCommand(123)).rejects.toThrow('リポジトリが設定されていません');
  });

  it('closes issue and changes status to Done', async () => {
    vi.mocked(getConfig).mockReturnValue({
      defaults: { repo: 'owner/repo', owner: 'owner', output: 'table', project: 1, projectOwner: null },
      rules: {} as any,
      slack: { botToken: null, appToken: null, channelId: null },
    });

    mockGraphqlInstance.findItemByIssueNumber.mockResolvedValue({ id: 'item-1' });
    mockGraphqlInstance.moveItem.mockResolvedValue(undefined);

    vi.mocked(RestAPI.fromRepoString).mockReturnValue({
      closeIssue: vi.fn().mockResolvedValue({
        number: 123,
        title: 'Test Issue',
        html_url: 'https://github.com/o/r/issues/123',
      }),
    } as any);

    const result = await handleCloseCommand(123, '対応済み');
    expect(result).toEqual({
      issueNumber: 123,
      title: 'Test Issue',
      html_url: 'https://github.com/o/r/issues/123',
      statusChanged: true,
    });
    expect(mockGraphqlInstance.moveItem).toHaveBeenCalledWith(1, 'item-1', 'Done');
  });

  it('closes issue even when status change fails', async () => {
    vi.mocked(getConfig).mockReturnValue({
      defaults: { repo: 'owner/repo', owner: 'owner', output: 'table', project: 1, projectOwner: null },
      rules: {} as any,
      slack: { botToken: null, appToken: null, channelId: null },
    });

    mockGraphqlInstance.findItemByIssueNumber.mockRejectedValue(new Error('GraphQL error'));

    vi.mocked(RestAPI.fromRepoString).mockReturnValue({
      closeIssue: vi.fn().mockResolvedValue({
        number: 123,
        title: 'Test Issue',
        html_url: 'https://github.com/o/r/issues/123',
      }),
    } as any);

    const result = await handleCloseCommand(123);
    expect(result.statusChanged).toBe(false);
    expect(result.issueNumber).toBe(123);
  });

  it('closes issue without project', async () => {
    vi.mocked(getConfig).mockReturnValue({
      defaults: { repo: 'owner/repo', owner: 'owner', output: 'table', project: null, projectOwner: null },
      rules: {} as any,
      slack: { botToken: null, appToken: null, channelId: null },
    });

    vi.mocked(RestAPI.fromRepoString).mockReturnValue({
      closeIssue: vi.fn().mockResolvedValue({
        number: 10,
        title: 'No Project Issue',
        html_url: 'https://github.com/o/r/issues/10',
      }),
    } as any);

    const result = await handleCloseCommand(10);
    expect(result.statusChanged).toBe(false);
    expect(result.issueNumber).toBe(10);
  });
});

// --- handleDueDateCommand ---

describe('handleDueDateCommand', () => {
  it('throws when project is not configured', async () => {
    vi.mocked(getConfig).mockReturnValue({
      defaults: { repo: null, owner: null, output: 'table', project: null, projectOwner: null },
      rules: {} as any,
      slack: { botToken: null, appToken: null, channelId: null },
    });

    await expect(handleDueDateCommand(123, '2026-04-15')).rejects.toThrow('プロジェクトが設定されていません');
  });

  it('throws NotFoundError when issue is not in project', async () => {
    vi.mocked(getConfig).mockReturnValue({
      defaults: { repo: 'owner/repo', owner: 'owner', output: 'table', project: 1, projectOwner: null },
      rules: {} as any,
      slack: { botToken: null, appToken: null, channelId: null },
    });

    mockGraphqlInstance.findItemByIssueNumber.mockResolvedValue(null);

    await expect(handleDueDateCommand(999, '2026-04-15')).rejects.toThrow(NotFoundError);
  });

  it('updates due date field', async () => {
    vi.mocked(getConfig).mockReturnValue({
      defaults: { repo: 'owner/repo', owner: 'owner', output: 'table', project: 1, projectOwner: null },
      rules: {} as any,
      slack: { botToken: null, appToken: null, channelId: null },
    });

    mockGraphqlInstance.findItemByIssueNumber.mockResolvedValue({
      id: 'item-1',
      content: { number: 123, title: 'Test Task' },
    });
    mockGraphqlInstance.getProjectFields.mockResolvedValue([
      { name: 'Status', dataType: 'SINGLE_SELECT' },
      { name: 'Due Date', dataType: 'DATE' },
    ]);
    mockGraphqlInstance.setItemFieldByValue.mockResolvedValue(undefined);

    const result = await handleDueDateCommand(123, '2026-04-15');
    expect(result).toEqual({
      issueNumber: 123,
      title: 'Test Task',
      dueDate: '2026-04-15',
    });
    expect(mockGraphqlInstance.setItemFieldByValue).toHaveBeenCalledWith(1, 'item-1', 'Due Date', '2026-04-15');
  });
});

// --- handleSearchCommand ---

describe('handleSearchCommand', () => {
  it('throws when repo is not configured', async () => {
    vi.mocked(getConfig).mockReturnValue({
      defaults: { repo: null, owner: null, output: 'table', project: null, projectOwner: null },
      rules: {} as any,
      slack: { botToken: null, appToken: null, channelId: null },
    });

    await expect(handleSearchCommand('test')).rejects.toThrow('リポジトリが設定されていません');
  });

  it('searches and returns items', async () => {
    vi.mocked(getConfig).mockReturnValue({
      defaults: { repo: 'owner/repo', owner: 'owner', output: 'table', project: 1, projectOwner: null },
      rules: {} as any,
      slack: { botToken: null, appToken: null, channelId: null },
    });

    vi.mocked(gh.api).mockResolvedValue({
      items: [
        { number: 10, title: 'レポートA', state: 'open', html_url: 'https://github.com/o/r/issues/10' },
        { number: 11, title: 'レポートB', state: 'open', html_url: 'https://github.com/o/r/issues/11' },
      ],
    });

    const result = await handleSearchCommand('レポート');
    expect(result.items).toHaveLength(2);
    expect(result.items[0].number).toBe(10);
    expect(result.query).toBe('レポート');
  });

  it('returns empty items when no match', async () => {
    vi.mocked(getConfig).mockReturnValue({
      defaults: { repo: 'owner/repo', owner: 'owner', output: 'table', project: 1, projectOwner: null },
      rules: {} as any,
      slack: { botToken: null, appToken: null, channelId: null },
    });

    vi.mocked(gh.api).mockResolvedValue({ items: [] });

    const result = await handleSearchCommand('存在しない');
    expect(result.items).toHaveLength(0);
  });
});

// --- フォーマッター（新規3コマンド） ---

describe('formatCloseResponse', () => {
  it('formats close result with status change', () => {
    const result: SlackCloseResult = {
      issueNumber: 123,
      title: 'Test Issue',
      html_url: 'https://github.com/o/r/issues/123',
      statusChanged: true,
    };
    const output = formatCloseResponse(result);
    expect(output).toContain('#123');
    expect(output).toContain('クローズしました');
    expect(output).toContain('*Done*');
  });

  it('formats close result without status change', () => {
    const result: SlackCloseResult = {
      issueNumber: 10,
      title: 'Simple Close',
      html_url: 'https://github.com/o/r/issues/10',
      statusChanged: false,
    };
    const output = formatCloseResponse(result);
    expect(output).toContain('#10');
    expect(output).toContain('クローズしました');
    expect(output).not.toContain('Done');
  });
});

describe('formatDueDateResponse', () => {
  it('formats due date change result', () => {
    const result: SlackDueDateResult = {
      issueNumber: 42,
      title: 'Task',
      dueDate: '2026-04-15',
    };
    const output = formatDueDateResponse(result);
    expect(output).toContain('#42');
    expect(output).toContain('2026-04-15');
    expect(output).toContain('期日');
  });
});

describe('formatSearchResponse', () => {
  it('formats empty search result', () => {
    const result: SlackSearchResult = { items: [], query: 'テスト' };
    const output = formatSearchResponse(result);
    expect(output).toContain('テスト');
    expect(output).toContain('見つかりませんでした');
  });

  it('formats search results with items', () => {
    const result: SlackSearchResult = {
      items: [
        { number: 10, title: 'レポートA', state: 'open', html_url: 'https://github.com/o/r/issues/10' },
        { number: 11, title: 'レポートB', state: 'open', html_url: 'https://github.com/o/r/issues/11' },
      ],
      query: 'レポート',
    };
    const output = formatSearchResponse(result);
    expect(output).toContain('レポート');
    expect(output).toContain('2件');
    expect(output).toContain('#10');
    expect(output).toContain('#11');
  });
});

describe('formatCommandError', () => {
  it('formats Error object', () => {
    const output = formatCommandError(new Error('test error'));
    expect(output).toContain('コマンド実行に失敗しました');
    expect(output).toContain('test error');
  });

  it('formats string error', () => {
    const output = formatCommandError('string error');
    expect(output).toContain('string error');
  });
});

// --- formatHelpResponse ---

describe('formatHelpResponse', () => {
  it('contains all command keywords', () => {
    const output = formatHelpResponse();
    expect(output).toContain('コマンド一覧');
    expect(output).toContain('一覧');
    expect(output).toContain('ステータス');
    expect(output).toContain('期日');
    expect(output).toContain('完了');
    expect(output).toContain('メモ');
    expect(output).toContain('検索');
    expect(output).toContain('ダッシュボード');
    expect(output).toContain('ヘルプ');
  });

  it('contains usage examples', () => {
    const output = formatHelpResponse();
    expect(output).toContain('MMDD');
    expect(output).toContain('Todo');
    expect(output).toContain('In Progress');
    expect(output).toContain('Done');
  });

  it('mentions scheduled notifications', () => {
    const output = formatHelpResponse();
    expect(output).toContain('9:00');
    expect(output).toContain('18:00');
  });
});

// --- collectDashboardData ---

function makeProjectItem(overrides: {
  number?: number;
  title?: string;
  status?: string;
  dueDate?: string | null;
}): ProjectItem {
  const fieldValues = [];
  if (overrides.status !== undefined) {
    fieldValues.push({ field: { name: 'Status' }, value: overrides.status });
  }
  if (overrides.dueDate !== undefined) {
    fieldValues.push({ field: { name: 'Due Date' }, value: overrides.dueDate });
  }
  return {
    id: `item-${overrides.number || 0}`,
    type: 'ISSUE',
    content: {
      number: overrides.number,
      title: overrides.title || 'Test',
      state: 'OPEN',
      url: `https://github.com/o/r/issues/${overrides.number}`,
    },
    fieldValues,
  };
}

describe('collectDashboardData', () => {
  it('returns zeros for empty items', () => {
    const result = collectDashboardData([], '2026-02-22');
    expect(result).toEqual({
      todayDueTotal: 0,
      todayDueCompleted: 0,
      overdueCount: 0,
      statusDistribution: {},
      totalItems: 0,
      totalDone: 0,
    });
  });

  it('counts today due tasks and completion', () => {
    const items = [
      makeProjectItem({ number: 1, status: 'Done', dueDate: '2026-02-22' }),
      makeProjectItem({ number: 2, status: 'In Progress', dueDate: '2026-02-22' }),
      makeProjectItem({ number: 3, status: 'Todo', dueDate: '2026-02-22' }),
    ];
    const result = collectDashboardData(items, '2026-02-22');
    expect(result.todayDueTotal).toBe(3);
    expect(result.todayDueCompleted).toBe(1);
  });

  it('counts overdue tasks (before today and not Done)', () => {
    const items = [
      makeProjectItem({ number: 1, status: 'In Progress', dueDate: '2026-02-20' }),
      makeProjectItem({ number: 2, status: 'Done', dueDate: '2026-02-20' }),
      makeProjectItem({ number: 3, status: 'Todo', dueDate: '2026-02-21' }),
    ];
    const result = collectDashboardData(items, '2026-02-22');
    expect(result.overdueCount).toBe(2);
  });

  it('calculates status distribution', () => {
    const items = [
      makeProjectItem({ number: 1, status: 'Done' }),
      makeProjectItem({ number: 2, status: 'Done' }),
      makeProjectItem({ number: 3, status: 'In Progress' }),
      makeProjectItem({ number: 4, status: 'Todo' }),
    ];
    const result = collectDashboardData(items, '2026-02-22');
    expect(result.statusDistribution).toEqual({
      'Done': 2,
      'In Progress': 1,
      'Todo': 1,
    });
  });

  it('counts total items and total done', () => {
    const items = [
      makeProjectItem({ number: 1, status: 'Done' }),
      makeProjectItem({ number: 2, status: 'Done' }),
      makeProjectItem({ number: 3, status: 'In Progress' }),
    ];
    const result = collectDashboardData(items, '2026-02-22');
    expect(result.totalItems).toBe(3);
    expect(result.totalDone).toBe(2);
  });

  it('handles items without status field', () => {
    const items = [
      makeProjectItem({ number: 1, dueDate: '2026-02-22' }),
    ];
    const result = collectDashboardData(items, '2026-02-22');
    expect(result.statusDistribution).toEqual({ 'No Status': 1 });
    expect(result.todayDueTotal).toBe(1);
    expect(result.todayDueCompleted).toBe(0);
  });
});

// --- handleDashboardCommand ---

describe('handleDashboardCommand', () => {
  it('throws when project is not configured', async () => {
    vi.mocked(getConfig).mockReturnValue({
      defaults: { repo: null, owner: null, output: 'table', project: null, projectOwner: null },
      rules: {} as any,
      slack: { botToken: null, appToken: null, channelId: null },
    });

    await expect(handleDashboardCommand()).rejects.toThrow('プロジェクトが設定されていません');
  });

  it('returns dashboard data from project', async () => {
    vi.useFakeTimers();
    // 2026-02-22 12:00 JST = 2026-02-22 03:00 UTC
    vi.setSystemTime(new Date('2026-02-22T03:00:00Z'));

    vi.mocked(getConfig).mockReturnValue({
      defaults: { repo: 'owner/repo', owner: 'owner', output: 'table', project: 1, projectOwner: null },
      rules: {} as any,
      slack: { botToken: null, appToken: null, channelId: null },
    });

    const mockItems = [
      makeProjectItem({ number: 1, status: 'Done', dueDate: '2026-02-22' }),
      makeProjectItem({ number: 2, status: 'In Progress', dueDate: '2026-02-22' }),
      makeProjectItem({ number: 3, status: 'Todo', dueDate: '2026-02-20' }),
    ];

    mockGraphqlInstance.getProject.mockResolvedValue({
      items: { nodes: mockItems },
    });

    const result = await handleDashboardCommand();
    expect(result.todayDueTotal).toBe(2);
    expect(result.todayDueCompleted).toBe(1);
    expect(result.overdueCount).toBe(1);
    expect(result.totalItems).toBe(3);
    expect(result.totalDone).toBe(1);

    vi.useRealTimers();
  });
});

// --- formatDashboardResponse ---

describe('formatDashboardResponse', () => {
  it('formats dashboard with today tasks', () => {
    const result: SlackDashboardResult = {
      todayDueTotal: 3,
      todayDueCompleted: 1,
      overdueCount: 1,
      statusDistribution: { 'Done': 5, 'In Progress': 4, 'Todo': 3 },
      totalItems: 12,
      totalDone: 5,
    };
    const output = formatDashboardResponse(result);
    expect(output).toContain('📊 *プロジェクト ダッシュボード*');
    expect(output).toContain('1/3 (33%)');
    expect(output).toContain('███░░░░░░░');
    expect(output).toContain('⚠️ *期限超過*: 1件');
    expect(output).toContain('✅ Done: 5件');
    expect(output).toContain('🔵 In Progress: 4件');
    expect(output).toContain('⬜ Todo: 3件');
    expect(output).toContain('全 12 タスク中 5 件完了');
  });

  it('formats dashboard with no today tasks', () => {
    const result: SlackDashboardResult = {
      todayDueTotal: 0,
      todayDueCompleted: 0,
      overdueCount: 0,
      statusDistribution: { 'Done': 2, 'Todo': 1 },
      totalItems: 3,
      totalDone: 2,
    };
    const output = formatDashboardResponse(result);
    expect(output).toContain('本日期限のタスクはありません');
    expect(output).not.toContain('期限超過');
  });

  it('formats 100% completion with full progress bar', () => {
    const result: SlackDashboardResult = {
      todayDueTotal: 2,
      todayDueCompleted: 2,
      overdueCount: 0,
      statusDistribution: { 'Done': 5 },
      totalItems: 5,
      totalDone: 5,
    };
    const output = formatDashboardResponse(result);
    expect(output).toContain('2/2 (100%)');
    expect(output).toContain('██████████');
  });
});
