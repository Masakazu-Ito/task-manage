import { App } from '@slack/bolt';
import { parseSlackCommand } from './parser.js';
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
  formatHelpResponse,
  formatListResponse,
  formatStatusResponse,
  formatMemoResponse,
  formatCloseResponse,
  formatDueDateResponse,
  formatSearchResponse,
  formatDashboardResponse,
  formatCommandError,
} from './handler.js';
import { TaskScheduler } from './scheduler.js';
import type { SlackCommand } from '../../types/slack.js';

const MAX_TRACKED_THREADS = 1000;
const MAX_PROCESSED_MESSAGES = 500;

export class SlackBot {
  private app: App;
  private scheduler: TaskScheduler | null = null;
  private botUserId: string | null = null;
  private activeThreads: Set<string> = new Set();
  private processedMessages: Set<string> = new Set();

  constructor(botToken: string, appToken: string, channelId?: string) {
    this.app = new App({
      token: botToken,
      appToken,
      socketMode: true,
    });

    this.registerHandlers();

    if (channelId) {
      this.scheduler = new TaskScheduler(this.app, channelId);
    }
  }

  private registerHandlers(): void {
    this.app.event('message', async ({ event, say }) => {
      // subtype 付きメッセージ（bot_message, message_changed 等）は無視
      if ('subtype' in event && event.subtype) return;

      // Bot 自身のメッセージは無視
      if ('bot_id' in event) return;
      const userId = 'user' in event ? (event.user as string) : undefined;
      if (!userId || userId === this.botUserId) return;

      const ts = 'ts' in event ? (event.ts as string) : undefined;

      // 同一メッセージの重複処理防止
      if (ts && this.processedMessages.has(ts)) return;
      if (ts) this.addToSet(this.processedMessages, ts, MAX_PROCESSED_MESSAGES);

      const text = 'text' in event ? (event.text || '') : '';
      const threadTs = ('thread_ts' in event ? event.thread_ts as string : undefined) || ts;
      if (!threadTs) return;

      // メンション検出: botUserId が取得済みなら正確に判定、未取得なら <@U...> パターンで判定
      const hasMention = this.botUserId
        ? text.includes(`<@${this.botUserId}>`)
        : /<@[A-Z0-9]+>/.test(text);

      if (hasMention) {
        this.addToSet(this.activeThreads, threadTs, MAX_TRACKED_THREADS);
        await this.handleCommand(text, threadTs, say);
      } else if ('thread_ts' in event && event.thread_ts && this.activeThreads.has(event.thread_ts as string)) {
        await this.handleCommand(text, event.thread_ts as string, say);
      }
    });

    // app_mention イベントのフォールバック（message.channels が未購読の場合に対応）
    this.app.event('app_mention', async ({ event, say }) => {
      const ts = event.ts;

      // message イベントで処理済みなら重複スキップ
      if (this.processedMessages.has(ts)) return;
      this.addToSet(this.processedMessages, ts, MAX_PROCESSED_MESSAGES);

      const text = event.text || '';
      const threadTs = ('thread_ts' in event ? event.thread_ts as string : undefined) || ts;
      if (!threadTs) return;

      this.addToSet(this.activeThreads, threadTs, MAX_TRACKED_THREADS);
      await this.handleCommand(text, threadTs, say);
    });
  }

  /** サイズ上限付き Set への追加（古いエントリから削除） */
  private addToSet(set: Set<string>, value: string, max: number): void {
    if (set.size >= max) {
      const oldest = set.values().next().value;
      if (oldest) set.delete(oldest);
    }
    set.add(value);
  }

  private async handleCommand(
    text: string,
    threadTs: string,
    say: (msg: { text: string; thread_ts: string }) => Promise<unknown>,
  ): Promise<void> {
    try {
      const command: SlackCommand = parseSlackCommand(text);

      switch (command.type) {
        case 'create': {
          const result = await createIssueFromTemplate(command.template);
          await say({ text: formatSlackResponse(result), thread_ts: threadTs });
          break;
        }
        case 'list': {
          const result = await handleListCommand(command.dueBefore);
          await say({ text: formatListResponse(result), thread_ts: threadTs });
          break;
        }
        case 'status': {
          const result = await handleStatusCommand(command.issueNumber, command.status);
          await say({ text: formatStatusResponse(result), thread_ts: threadTs });
          break;
        }
        case 'memo': {
          const result = await handleMemoCommand(command.issueNumber, command.content);
          await say({ text: formatMemoResponse(result), thread_ts: threadTs });
          break;
        }
        case 'close': {
          const result = await handleCloseCommand(command.issueNumber, command.comment);
          await say({ text: formatCloseResponse(result), thread_ts: threadTs });
          break;
        }
        case 'duedate': {
          const result = await handleDueDateCommand(command.issueNumber, command.dueDate);
          await say({ text: formatDueDateResponse(result), thread_ts: threadTs });
          break;
        }
        case 'search': {
          const result = await handleSearchCommand(command.query);
          await say({ text: formatSearchResponse(result), thread_ts: threadTs });
          break;
        }
        case 'dashboard': {
          const result = await handleDashboardCommand();
          await say({ text: formatDashboardResponse(result), thread_ts: threadTs });
          break;
        }
        case 'help': {
          await say({ text: formatHelpResponse(), thread_ts: threadTs });
          break;
        }
      }
    } catch (err) {
      try {
        await say({
          text: formatCommandError(err),
          thread_ts: threadTs,
        });
      } catch (sayErr) {
        console.error('[SlackBot] Failed to send error response:', sayErr instanceof Error ? sayErr.message : sayErr);
      }
    }
  }

  async start(): Promise<void> {
    await this.app.start();

    try {
      const auth = await this.app.client.auth.test();
      this.botUserId = auth.user_id || null;
    } catch {
      console.warn('[SlackBot] auth.test() に失敗しました。メンション検出は <@U...> パターンで代替します。');
    }

    if (this.scheduler) {
      this.scheduler.start();
    }
  }

  async stop(): Promise<void> {
    if (this.scheduler) {
      this.scheduler.stop();
    }
    await this.app.stop();
  }
}
