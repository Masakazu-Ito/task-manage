/**
 * Configuration file type definitions for ghp CLI
 */

import type { RulesConfig } from './rules.js';
import type { SlackConfig } from './slack.js';

export interface GhpConfig {
  defaults?: {
    /** Default repository in owner/repo format */
    repo?: string;
    /** Default owner for projects */
    owner?: string;
    /** Default output format: 'table' or 'json' */
    output?: 'table' | 'json';
    /** Default project number to add issues to */
    project?: number;
    /** Default project owner (if different from repo owner) */
    projectOwner?: string;
    /** Default assignee for new issues */
    assignee?: string;
  };
  /** Rule violation detection settings */
  rules?: Partial<RulesConfig>;
  /** Slack Bot settings */
  slack?: SlackConfig;
}

export interface ResolvedConfig {
  defaults: {
    repo: string | null;
    owner: string | null;
    output: 'table' | 'json';
    project: number | null;
    projectOwner: string | null;
    assignee: string | null;
  };
  rules: RulesConfig;
  slack: {
    botToken: string | null;
    appToken: string | null;
    channelId: string | null;
  };
}
