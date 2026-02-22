import { RestAPI } from '../github/rest.js';
import { GraphQLAPI } from '../github/graphql.js';
import { gh } from '../github/client.js';
import { getConfig } from '../config.js';
import { getJSTToday } from '../jst.js';
import { NotFoundError } from '../errors.js';
import type {
  ParsedIssueTemplate,
  SlackIssueCreationResult,
  SlackListResult,
  SlackStatusResult,
  SlackMemoResult,
  SlackCloseResult,
  SlackDueDateResult,
  SlackSearchResult,
  SlackDashboardResult,
} from '../../types/slack.js';
import { getItemFieldValue } from '../../types/project.js';
import type { ProjectItem } from '../../types/project.js';

const graphql = new GraphQLAPI();

function requireRepo(): void {
  const config = getConfig();
  if (!config.defaults.repo) {
    throw new Error('リポジトリが設定されていません。.ghprc.json の defaults.repo を設定してください。');
  }
}

function requireProjectNumber(): number {
  const config = getConfig();
  const projectNumber = config.defaults.project;
  if (!projectNumber) {
    throw new Error('プロジェクトが設定されていません。.ghprc.json の defaults.project を設定してください。');
  }
  return projectNumber;
}

export async function createIssueFromTemplate(
  template: ParsedIssueTemplate,
): Promise<SlackIssueCreationResult> {
  requireRepo();
  const config = getConfig();

  const rest = RestAPI.fromRepoString();
  const body = template.dueTime
    ? `期限: ${template.dueDate} ${template.dueTime} JST`
    : '';
  const issue = await rest.createIssue({ title: template.title, body, assignees: ['Masakazu-Ito'] });

  const result: SlackIssueCreationResult = {
    issue: { number: issue.number, title: issue.title, html_url: issue.html_url },
  };

  // Use default project from config
  const projectNumber = config.defaults.project;

  if (projectNumber !== null) {
    try {
      const itemId = await graphql.addItemToProject(projectNumber, issue.number);
      result.project = {
        projectNumber,
        projectName: `#${projectNumber}`,
        itemId,
        fieldsSet: [],
      };

      // Set due date if specified
      if (template.dueDate && itemId) {
        try {
          // Find the actual DATE field name (case-insensitive match)
          const fields = await graphql.getProjectFields(projectNumber);
          const dateField = fields.find(
            f => f.dataType === 'DATE' && f.name.toLowerCase().replace(/\s+/g, '') === 'duedate',
          );
          const dueDateFieldName = dateField?.name || 'Due Date';

          await graphql.setItemFieldByValue(projectNumber, itemId, dueDateFieldName, template.dueDate);
          result.project.fieldsSet!.push({ field: dueDateFieldName, success: true });
        } catch (err) {
          result.project.fieldsSet!.push({
            field: 'Due Date',
            success: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    } catch (err) {
      result.project = {
        projectNumber,
        projectName: `#${projectNumber}`,
        fieldsSet: [{
          field: 'Project Add',
          success: false,
          error: err instanceof Error ? err.message : String(err),
        }],
      };
    }
  }

  return result;
}

export function formatSlackResponse(result: SlackIssueCreationResult): string {
  const lines: string[] = [
    `*Issue #${result.issue.number}* を作成しました`,
    `<${result.issue.html_url}|${result.issue.title}>`,
  ];

  if (result.project) {
    if (result.project.itemId) {
      lines.push(`プロジェクト *${result.project.projectName}* に追加しました`);
    }
    if (result.project.fieldsSet) {
      for (const fs of result.project.fieldsSet) {
        if (!fs.success) {
          lines.push(`\u26a0\ufe0f ${fs.field} の設定に失敗: ${fs.error}`);
        }
      }
    }
  }

  return lines.join('\n');
}

// --- 一覧コマンド ---

export async function handleListCommand(dueBefore?: string): Promise<SlackListResult> {
  const projectNumber = requireProjectNumber();
  const filters = dueBefore ? { dueBefore } : undefined;
  const sort = { field: 'Due Date', direction: 'asc' as const };
  const items = await graphql.getProjectItemsFiltered(projectNumber, filters, sort);

  return {
    items: items.map(item => {
      const status = getItemFieldValue(item, 'Status');
      const dueDate = getItemFieldValue(item, 'Due Date');
      return {
        issueNumber: item.content?.number,
        title: item.content?.title || '(untitled)',
        status: String(status || 'No Status'),
        dueDate: dueDate ? String(dueDate) : null,
        url: item.content?.url,
      };
    }),
    dueBefore,
  };
}

export function formatListResponse(result: SlackListResult): string {
  if (result.items.length === 0) {
    const suffix = result.dueBefore ? ` (期限: ${result.dueBefore} まで)` : '';
    return `📋 タスクが見つかりませんでした${suffix}`;
  }

  const header = result.dueBefore
    ? `📋 タスク一覧 (期限: ${result.dueBefore} まで) - ${result.items.length}件`
    : `📋 タスク一覧 - ${result.items.length}件`;

  const lines = result.items.map(item => {
    const num = item.issueNumber ? `#${item.issueNumber}` : '(draft)';
    const due = item.dueDate ? `  📅${item.dueDate}` : '';
    const title = item.url ? `<${item.url}|${item.title}>` : item.title;
    return `  ${num} ${title}  [${item.status}]${due}`;
  });

  return [header, ...lines].join('\n');
}

// --- ステータス変更コマンド ---

export async function handleStatusCommand(issueNumber: number, status: string): Promise<SlackStatusResult> {
  const projectNumber = requireProjectNumber();
  const item = await graphql.findItemByIssueNumber(projectNumber, issueNumber);

  if (!item) {
    throw new NotFoundError('Issue', `Issue #${issueNumber} はプロジェクト内に見つかりません。`);
  }

  await graphql.moveItem(projectNumber, item.id, status);

  return { issueNumber, newStatus: status };
}

export function formatStatusResponse(result: SlackStatusResult): string {
  return `✅ Issue #${result.issueNumber} のステータスを *${result.newStatus}* に変更しました`;
}

// --- メモ追記コマンド ---

export async function handleMemoCommand(issueNumber: number, content: string): Promise<SlackMemoResult> {
  requireRepo();

  const rest = RestAPI.fromRepoString();
  const issue = await rest.getIssue(issueNumber);

  const currentBody = issue.body || '';
  const newBody = currentBody ? `${currentBody}\n\n${content}` : content;
  await rest.updateIssue(issueNumber, { body: newBody });

  return {
    issueNumber,
    title: issue.title,
    html_url: issue.html_url,
  };
}

export function formatMemoResponse(result: SlackMemoResult): string {
  return `📝 Issue #${result.issueNumber} にメモを追記しました\n<${result.html_url}|${result.title}>`;
}

// --- 完了コマンド ---

export async function handleCloseCommand(issueNumber: number, comment?: string): Promise<SlackCloseResult> {
  requireRepo();
  const config = getConfig();

  let statusChanged = false;
  const projectNumber = config.defaults.project;

  // プロジェクトがあればステータスを Done に変更（失敗しても続行）
  if (projectNumber) {
    try {
      const item = await graphql.findItemByIssueNumber(projectNumber, issueNumber);
      if (item) {
        await graphql.moveItem(projectNumber, item.id, 'Done');
        statusChanged = true;
      }
    } catch {
      // ステータス変更の失敗は無視して Issue クローズを続行
    }
  }

  const rest = RestAPI.fromRepoString();
  const issue = await rest.closeIssue(issueNumber, comment);

  return {
    issueNumber,
    title: issue.title,
    html_url: issue.html_url,
    statusChanged,
  };
}

export function formatCloseResponse(result: SlackCloseResult): string {
  const lines = [`✅ Issue #${result.issueNumber} をクローズしました`];
  lines.push(`<${result.html_url}|${result.title}>`);
  if (result.statusChanged) {
    lines.push('ステータスを *Done* に変更しました');
  }
  return lines.join('\n');
}

// --- 期日変更コマンド ---

export async function handleDueDateCommand(issueNumber: number, dueDate: string): Promise<SlackDueDateResult> {
  const projectNumber = requireProjectNumber();
  const item = await graphql.findItemByIssueNumber(projectNumber, issueNumber);

  if (!item) {
    throw new NotFoundError('Issue', `Issue #${issueNumber} はプロジェクト内に見つかりません。`);
  }

  // Due Date フィールド名を取得
  const fields = await graphql.getProjectFields(projectNumber);
  const dateField = fields.find(
    f => f.dataType === 'DATE' && f.name.toLowerCase().replace(/\s+/g, '') === 'duedate',
  );
  const dueDateFieldName = dateField?.name || 'Due Date';

  await graphql.setItemFieldByValue(projectNumber, item.id, dueDateFieldName, dueDate);

  return {
    issueNumber,
    title: item.content?.title || `Issue #${issueNumber}`,
    dueDate,
  };
}

export function formatDueDateResponse(result: SlackDueDateResult): string {
  return `📅 Issue #${result.issueNumber} の期日を *${result.dueDate}* に変更しました`;
}

// --- 検索コマンド ---

export async function handleSearchCommand(query: string): Promise<SlackSearchResult> {
  requireRepo();
  const config = getConfig();

  const searchQuery = `${query} repo:${config.defaults.repo} type:issue state:open`;
  const params = new URLSearchParams();
  params.append('q', searchQuery);
  params.append('per_page', '10');

  const result = await gh.api<{ items: Array<{ number: number; title: string; state: string; html_url: string }> }>(
    `/search/issues?${params.toString()}`,
  );

  return {
    items: (result?.items ?? []).map(item => ({
      number: item.number,
      title: item.title,
      state: item.state,
      html_url: item.html_url,
    })),
    query,
  };
}

export function formatSearchResponse(result: SlackSearchResult): string {
  if (result.items.length === 0) {
    return `🔍 「${result.query}」に一致するIssueが見つかりませんでした`;
  }

  const header = `🔍 「${result.query}」の検索結果 - ${result.items.length}件`;
  const lines = result.items.map(item =>
    `  #${item.number} <${item.html_url}|${item.title}>`,
  );

  return [header, ...lines].join('\n');
}

// --- ダッシュボードコマンド ---

export function collectDashboardData(items: ProjectItem[], today: string): SlackDashboardResult {
  let todayDueTotal = 0;
  let todayDueCompleted = 0;
  let overdueCount = 0;
  let totalDone = 0;
  const statusDistribution: Record<string, number> = {};

  for (const item of items) {
    const statusVal = getItemFieldValue(item, 'Status');
    const dueDateVal = getItemFieldValue(item, 'Due Date');
    const status = statusVal ? String(statusVal) : 'No Status';
    const dueDate = dueDateVal ? String(dueDateVal) : null;

    // ステータス分布
    statusDistribution[status] = (statusDistribution[status] || 0) + 1;

    // 全体 Done 数
    if (status === 'Done') {
      totalDone++;
    }

    // 本日期限の完了率
    if (dueDate === today) {
      todayDueTotal++;
      if (status === 'Done') {
        todayDueCompleted++;
      }
    }

    // 期限超過（Due Date < today かつ Status != Done）
    if (dueDate && dueDate < today && status !== 'Done') {
      overdueCount++;
    }
  }

  return {
    todayDueTotal,
    todayDueCompleted,
    overdueCount,
    statusDistribution,
    totalItems: items.length,
    totalDone,
  };
}

export async function handleDashboardCommand(): Promise<SlackDashboardResult> {
  const projectNumber = requireProjectNumber();

  const project = await graphql.getProject(projectNumber);
  const allItems = project.items.nodes;

  const today = getJSTToday();

  return collectDashboardData(allItems, today);
}

export function formatDashboardResponse(result: SlackDashboardResult): string {
  const lines: string[] = ['📊 *プロジェクト ダッシュボード*'];
  lines.push('');

  // 本日期限の完了率
  if (result.todayDueTotal > 0) {
    const pct = Math.round((result.todayDueCompleted / result.todayDueTotal) * 100);
    const filled = Math.round(pct / 10);
    const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);
    lines.push(`*本日期限の完了率*: ${result.todayDueCompleted}/${result.todayDueTotal} (${pct}%) ${bar}`);
  } else {
    lines.push('*本日期限の完了率*: 本日期限のタスクはありません');
  }

  // 期限超過
  if (result.overdueCount > 0) {
    lines.push(`⚠️ *期限超過*: ${result.overdueCount}件`);
  }

  // ステータス分布
  lines.push('');
  lines.push('*ステータス分布*');

  const statusEmoji: Record<string, string> = {
    'Done': '✅',
    'In Progress': '🔵',
    'Todo': '⬜',
  };

  const entries = Object.entries(result.statusDistribution)
    .sort(([, a], [, b]) => b - a);

  for (const [status, count] of entries) {
    const emoji = statusEmoji[status] || '▫️';
    lines.push(`  ${emoji} ${status}: ${count}件`);
  }

  // 全体サマリー
  lines.push('');
  lines.push(`全 ${result.totalItems} タスク中 ${result.totalDone} 件完了`);

  return lines.join('\n');
}

// --- ヘルプコマンド ---

export function formatHelpResponse(): string {
  return [
    '📖 *コマンド一覧*',
    '',
    '*タスク作成*',
    '  `タスクのタイトル` — Issue を作成（1行目がタイトル）',
    '  `タスクのタイトル` + 改行 + `MMDD` — 期日付きで作成',
    '  `タスクのタイトル` + 改行 + `MMDDTT` — 期日+時刻付きで作成',
    '  例: `レポート提出` / `レポート提出` + `0315` / `レポート提出` + `031514`',
    '',
    '*タスク管理*',
    '  `一覧` — プロジェクト内の全タスクを表示',
    '  `一覧 MMDD` — 指定日までのタスクを表示',
    '  `ステータス <番号> <状態>` — ステータスを変更',
    '  `期日 <番号> MMDD` — 期日を変更',
    '  `完了 <番号>` — Issue をクローズ（ステータスを Done に変更）',
    '  `完了 <番号>` + 改行 + `コメント` — コメント付きでクローズ',
    '  `メモ <番号>` + 改行 + `内容` — Issue 本文にメモを追記',
    '',
    '*検索・分析*',
    '  `検索 <キーワード>` — Issue をキーワード検索',
    '  `ダッシュボード` — 完了率・ステータス分布を表示',
    '',
    '*その他*',
    '  `ヘルプ` — このヘルプを表示',
    '',
    '_ステータス値: Todo / In Progress / Done_',
    '_日付形式: MMDD（例: 0315 → 3月15日）/ MMDDTT（例: 031514 → 3月15日 14時）_',
    '_定期通知: 毎日 9:00 / 18:00 JST に本日タスク・期限超過・ダッシュボードサマリーを通知_',
  ].join('\n');
}

// --- 汎用エラーフォーマッター ---

export function formatCommandError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return `❌ コマンド実行に失敗しました\n\`\`\`${message}\`\`\``;
}
