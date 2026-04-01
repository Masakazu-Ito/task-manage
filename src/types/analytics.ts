// 日別完了タスクデータ
export interface DailyCompletionData {
  date: string; // YYYY-MM-DD
  count: number;
  issues: CompletedIssue[];
}

export interface CompletedIssue {
  number: number;
  title: string;
  labels: string[];
  closedAt: string;
  createdAt: string;
  cycleTimeHours: number;
}

// カテゴリ別分析データ
export interface CategoryAnalysis {
  name: string;
  totalCount: number;
  completedCount: number;
  openCount: number;
  completionRate: number;
  avgCycleTimeHours: number;
  issues: CategoryIssue[];
}

export interface CategoryIssue {
  number: number;
  title: string;
  state: 'open' | 'closed';
  createdAt: string;
  closedAt: string | null;
  cycleTimeHours: number | null;
}

// 週間トレンドデータ
export interface WeeklyTrend {
  weekLabel: string; // W01, W02, ...
  weekStart: string; // YYYY-MM-DD
  weekEnd: string;
  completed: number;
  created: number;
  velocity: number; // completed - created
  completionRate: number;
}

// ダッシュボード統合データ
export interface DashboardData {
  repo: string;
  periodStart: string;
  periodEnd: string;
  daily: DailyCompletionData[];
  categories: CategoryAnalysis[];
  trends: WeeklyTrend[];
  summary: DashboardSummary;
}

export interface DashboardSummary {
  totalCompleted: number;
  totalCreated: number;
  avgDailyCompletion: number;
  avgCycleTimeHours: number;
  topCategory: string | null;
  velocity: number;
}

// タイマー関連の型
export interface TimerSession {
  issue: number;
  repo: string;
  startedAt: string; // ISO 8601
}

export interface TimeEntry {
  issue: number;
  repo: string;
  date: string; // YYYY-MM-DD
  duration: number; // seconds
  description: string;
  dueDate?: string; // YYYY-MM-DD 期日
  alert?: boolean; // ルール違反時に true
  alertReasons?: string[]; // 違反理由のリスト
}

export interface TimeLogData {
  current: TimerSession | null;
  entries: TimeEntry[];
}

// チャート生成オプション
export interface ChartOptions {
  width?: number;
  height?: number;
  barChar?: string;
  emptyChar?: string;
  showLabels?: boolean;
}

// 分析クエリオプション
export interface AnalyticsQueryOptions {
  repo?: string;
  days?: number;
  weeks?: number;
  labels?: string[];
  byField?: 'labels' | 'fields';
}

// 出力形式（src/lib/output.ts の OutputFormat を使用）
export type { OutputFormat } from '../lib/output.js';

// HTML出力オプション
export interface HtmlOutputOptions {
  outputPath: string;
  title?: string;
  includeChartJs?: boolean;
}
