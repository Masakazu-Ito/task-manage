import type { App } from '@slack/bolt';
import { GraphQLAPI } from '../github/graphql.js';
import { getConfig } from '../config.js';
import { collectDashboardData } from './handler.js';
import { getItemFieldValue } from '../../types/project.js';
import type { ProjectItem } from '../../types/project.js';
import type { SlackDashboardResult } from '../../types/slack.js';

const JST_OFFSET = 9 * 60; // UTC+9 in minutes
const NOTIFY_HOURS = [9, 18]; // 9:00 and 18:00 JST

function getJSTNow(): Date {
  const now = new Date();
  // Create a Date representing JST by adjusting UTC
  return new Date(now.getTime() + JST_OFFSET * 60 * 1000);
}

function getJSTToday(): string {
  const jst = getJSTNow();
  const y = jst.getUTCFullYear();
  const m = String(jst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(jst.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getJSTTomorrow(): string {
  const jst = getJSTNow();
  jst.setUTCDate(jst.getUTCDate() + 1);
  const y = jst.getUTCFullYear();
  const m = String(jst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(jst.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getNextNotifyTime(): Date {
  const now = new Date();
  const jst = getJSTNow();
  const currentHour = jst.getUTCHours();
  const currentMinute = jst.getUTCMinutes();

  for (const hour of NOTIFY_HOURS) {
    if (currentHour < hour || (currentHour === hour && currentMinute === 0)) {
      // Next notify is today at this hour JST
      const target = new Date(now);
      const jstTarget = new Date(target.getTime() + JST_OFFSET * 60 * 1000);
      jstTarget.setUTCHours(hour, 0, 0, 0);
      // Convert back to UTC
      return new Date(jstTarget.getTime() - JST_OFFSET * 60 * 1000);
    }
  }

  // All today's times passed, schedule for tomorrow 9:00 JST
  const tomorrow = new Date(now);
  const jstTomorrow = new Date(tomorrow.getTime() + JST_OFFSET * 60 * 1000);
  jstTomorrow.setUTCDate(jstTomorrow.getUTCDate() + 1);
  jstTomorrow.setUTCHours(NOTIFY_HOURS[0], 0, 0, 0);
  return new Date(jstTomorrow.getTime() - JST_OFFSET * 60 * 1000);
}


export function formatNotification(
  todayItems: ProjectItem[],
  overdueItems: ProjectItem[],
  dashboard?: SlackDashboardResult,
): string | null {
  if (todayItems.length === 0 && overdueItems.length === 0 && !dashboard) {
    return null;
  }

  const lines: string[] = ['🌅 本日のタスク通知'];

  if (todayItems.length > 0) {
    lines.push('');
    lines.push(`*本日期限のタスク (${todayItems.length}件)*`);
    for (const item of todayItems) {
      const num = item.content?.number ? `#${item.content.number}` : '(draft)';
      const title = item.content?.title || '(untitled)';
      const status = getItemFieldValue(item, 'Status') || 'No Status';
      lines.push(`  ${num} ${title}  [${status}]`);
    }
  }

  if (overdueItems.length > 0) {
    lines.push('');
    lines.push(`⚠️ 期限超過のタスク (${overdueItems.length}件)`);
    for (const item of overdueItems) {
      const num = item.content?.number ? `#${item.content.number}` : '(draft)';
      const title = item.content?.title || '(untitled)';
      const dueDate = getItemFieldValue(item, 'Due Date');
      lines.push(`  ${num} ${title}  [期限: ${dueDate}]`);
    }
  }

  // ダッシュボードサマリー行
  if (dashboard) {
    lines.push('');
    lines.push('---');
    if (dashboard.todayDueTotal > 0) {
      const pct = Math.round((dashboard.todayDueCompleted / dashboard.todayDueTotal) * 100);
      lines.push(`📊 本日完了率: ${dashboard.todayDueCompleted}/${dashboard.todayDueTotal} (${pct}%) | 全体: ${dashboard.totalDone}/${dashboard.totalItems}完了 | 超過: ${dashboard.overdueCount}件`);
    } else {
      lines.push(`📊 全体: ${dashboard.totalDone}/${dashboard.totalItems}完了 | 超過: ${dashboard.overdueCount}件`);
    }
  }

  return lines.join('\n');
}

export class TaskScheduler {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private app: App;
  private channelId: string;

  constructor(app: App, channelId: string) {
    this.app = app;
    this.channelId = channelId;
  }

  start(): void {
    this.scheduleNext();
  }

  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private scheduleNext(): void {
    const next = getNextNotifyTime();
    const delay = next.getTime() - Date.now();
    // Ensure minimum 1 second delay to avoid tight loops
    const safeDelay = Math.max(delay, 1000);

    this.timer = setTimeout(async () => {
      await this.sendNotification();
      this.scheduleNext();
    }, safeDelay);
  }

  async sendNotification(): Promise<void> {
    try {
      const config = getConfig();
      const projectNumber = config.defaults.project;

      if (!projectNumber) return;

      const graphql = new GraphQLAPI();
      const today = getJSTToday();
      const tomorrow = getJSTTomorrow();

      // 1回の API 呼び出しで全アイテム取得
      const project = await graphql.getProject(projectNumber);
      const allItems = project.items.nodes;

      // メモリ上でフィルタ
      const todayItems = allItems
        .filter(item => {
          const dueDate = getItemFieldValue(item, 'Due Date');
          return dueDate && String(dueDate) >= today && String(dueDate) < tomorrow;
        })
        .sort((a, b) => {
          const aDate = String(getItemFieldValue(a, 'Due Date') || '');
          const bDate = String(getItemFieldValue(b, 'Due Date') || '');
          return aDate.localeCompare(bDate);
        });

      const overdueItems = allItems
        .filter(item => {
          const dueDate = getItemFieldValue(item, 'Due Date');
          const status = getItemFieldValue(item, 'Status');
          return dueDate && String(dueDate) < today && status !== 'Done';
        })
        .sort((a, b) => {
          const aDate = String(getItemFieldValue(a, 'Due Date') || '');
          const bDate = String(getItemFieldValue(b, 'Due Date') || '');
          return aDate.localeCompare(bDate);
        });

      // ダッシュボードデータ算出
      const dashboard = collectDashboardData(allItems, today);

      const message = formatNotification(todayItems, overdueItems, dashboard);
      if (!message) return;

      await this.app.client.chat.postMessage({
        channel: this.channelId,
        text: message,
      });
    } catch (err) {
      console.error('[TaskScheduler] Failed to send notification:', err instanceof Error ? err.message : err);
    }
  }
}
