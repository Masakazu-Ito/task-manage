/**
 * Configuration file support for ghp CLI
 * Reads .ghprc.json from current directory or home directory
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { GhpConfig, ResolvedConfig } from '../types/config.js';
import { DEFAULT_RULES_CONFIG } from './rules/defaults.js';

const CONFIG_FILE_NAME = '.ghprc.json';

let cachedConfig: ResolvedConfig | null = null;

/**
 * Find and read the configuration file
 * Priority: current directory > home directory
 */
function findConfigFile(): string | null {
  // Check current directory
  const localPath = join(process.cwd(), CONFIG_FILE_NAME);
  if (existsSync(localPath)) {
    return localPath;
  }

  // Check home directory
  const homePath = join(homedir(), CONFIG_FILE_NAME);
  if (existsSync(homePath)) {
    return homePath;
  }

  return null;
}

/**
 * Load configuration from file
 */
function loadConfig(): GhpConfig {
  const configPath = findConfigFile();
  if (!configPath) {
    return {};
  }

  try {
    const content = readFileSync(configPath, 'utf-8');
    return JSON.parse(content) as GhpConfig;
  } catch (err) {
    console.warn(`[ghp] Failed to parse config file ${configPath}:`, err instanceof Error ? err.message : err);
    return {};
  }
}

/**
 * Get resolved configuration with defaults
 */
export function getConfig(): ResolvedConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const config = loadConfig();
  const userRules = config.rules || {};

  cachedConfig = {
    defaults: {
      repo: config.defaults?.repo || null,
      owner: config.defaults?.owner || null,
      output: config.defaults?.output || 'table',
      project: config.defaults?.project || null,
      projectOwner: config.defaults?.projectOwner || null,
    },
    rules: {
      enabled: userRules.enabled ?? DEFAULT_RULES_CONFIG.enabled,
      alertOnTimerCommands: userRules.alertOnTimerCommands ?? DEFAULT_RULES_CONFIG.alertOnTimerCommands,
      overdue: { ...DEFAULT_RULES_CONFIG.overdue!, ...userRules.overdue },
      stale: { ...DEFAULT_RULES_CONFIG.stale!, ...userRules.stale },
      excessiveDaily: { ...DEFAULT_RULES_CONFIG.excessiveDaily!, ...userRules.excessiveDaily },
      longRunning: { ...DEFAULT_RULES_CONFIG.longRunning!, ...userRules.longRunning },
      noDueDate: { ...DEFAULT_RULES_CONFIG.noDueDate!, ...userRules.noDueDate },
    },
    slack: {
      botToken: process.env.GHP_SLACK_BOT_TOKEN || config.slack?.botToken || null,
      appToken: process.env.GHP_SLACK_APP_TOKEN || config.slack?.appToken || null,
      channelId: config.slack?.channelId || null,
    },
  };

  return cachedConfig;
}

/**
 * Clear cached configuration (useful for testing)
 */
export function clearConfigCache(): void {
  cachedConfig = null;
}

/**
 * Get default repository from config
 */
export function getDefaultRepo(): string | null {
  return getConfig().defaults.repo;
}

/**
 * Get default owner from config
 */
export function getDefaultOwner(): string | null {
  return getConfig().defaults.owner;
}

/**
 * Get default output format from config
 */
export function getDefaultOutputFormat(): 'table' | 'json' {
  return getConfig().defaults.output;
}

/**
 * Get effective output format (CLI option > config > 'table')
 */
export function getOutputFormat(cliOption: boolean | undefined): 'table' | 'json' {
  // If --json flag is explicitly passed, use JSON
  if (cliOption === true) {
    return 'json';
  }
  // Otherwise use config default
  return getDefaultOutputFormat();
}

/**
 * Get default project number from config
 */
export function getDefaultProject(): number | null {
  return getConfig().defaults.project;
}

/**
 * Get default project owner from config
 */
export function getDefaultProjectOwner(): string | null {
  return getConfig().defaults.projectOwner;
}

/**
 * Get Slack configuration
 */
export function getSlackConfig(): ResolvedConfig['slack'] {
  return getConfig().slack;
}

/**
 * Write updates to .ghprc.json in current directory (merge with existing)
 */
export function writeConfig(updates: Partial<GhpConfig>): void {
  const configPath = join(process.cwd(), CONFIG_FILE_NAME);
  let existing: GhpConfig = {};

  if (existsSync(configPath)) {
    try {
      existing = JSON.parse(readFileSync(configPath, 'utf-8')) as GhpConfig;
    } catch {
      // Invalid JSON - start fresh
    }
  }

  const merged: GhpConfig = {
    ...existing,
    ...updates,
    defaults: { ...existing.defaults, ...updates.defaults },
    rules: { ...existing.rules, ...updates.rules },
    slack: { ...existing.slack, ...updates.slack },
  };

  writeFileSync(configPath, JSON.stringify(merged, null, 2) + '\n', 'utf-8');
  clearConfigCache();
}
