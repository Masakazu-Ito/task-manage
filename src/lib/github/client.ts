import { execSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parseGhError, GhpError } from '../errors.js';
import { withRetry, RetryOptions } from '../retry.js';

const execFileAsync = promisify(execFile);

export interface ExecResult {
  stdout: string;
  stderr: string;
}

export interface ApiOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
  retry?: boolean | RetryOptions;
}

export class GitHubClient {
  private static instance: GitHubClient;

  static getInstance(): GitHubClient {
    if (!GitHubClient.instance) {
      GitHubClient.instance = new GitHubClient();
    }
    return GitHubClient.instance;
  }

  async exec(args: string[]): Promise<ExecResult> {
    try {
      const result = await execFileAsync('gh', args);
      return {
        stdout: result.stdout,
        stderr: result.stderr,
      };
    } catch (err: unknown) {
      const error = err as { stdout?: string; stderr?: string; message?: string };
      const stderr = error.stderr || error.message || 'gh command failed';
      throw parseGhError(stderr);
    }
  }

  execSync(args: string[]): string {
    const command = ['gh', ...args].join(' ');
    try {
      return execSync(command, { encoding: 'utf-8' });
    } catch (err: unknown) {
      const error = err as { stderr?: Buffer; message?: string };
      const stderr = error.stderr?.toString() || error.message || 'gh command failed';
      throw parseGhError(stderr);
    }
  }

  async api<T>(endpoint: string, options: ApiOptions = {}): Promise<T> {
    const { retry = true, ...restOptions } = options;

    const doRequest = async (): Promise<T> => {
      const args = ['api', endpoint];

      if (restOptions.method) {
        args.push('-X', restOptions.method);
      }

      if (restOptions.body) {
        args.push('-f', ...Object.entries(restOptions.body).flatMap(([k, v]) => {
          if (typeof v === 'string') {
            return [`${k}=${v}`];
          }
          return [`${k}=${JSON.stringify(v)}`];
        }));
      }

      if (restOptions.headers) {
        for (const [key, value] of Object.entries(restOptions.headers)) {
          args.push('-H', `${key}: ${value}`);
        }
      }

      const result = await this.exec(args);
      if (!result.stdout.trim()) {
        return undefined as unknown as T;
      }
      return JSON.parse(result.stdout) as T;
    };

    if (retry) {
      const retryOptions: RetryOptions = typeof retry === 'object' ? retry : {};
      return withRetry(doRequest, retryOptions);
    }

    return doRequest();
  }

  async graphql<T>(query: string, variables?: Record<string, unknown>, options: { retry?: boolean | RetryOptions } = {}): Promise<T> {
    const { retry = true } = options;

    const doRequest = async (): Promise<T> => {
      const args = ['api', 'graphql'];

      args.push('-f', `query=${query}`);

      if (variables) {
        for (const [key, value] of Object.entries(variables)) {
          if (typeof value === 'string') {
            args.push('-f', `${key}=${value}`);
          } else if (typeof value === 'number' || typeof value === 'boolean') {
            args.push('-F', `${key}=${value}`);
          } else {
            args.push('-F', `${key}=${JSON.stringify(value)}`);
          }
        }
      }

      const result = await this.exec(args);
      const response = JSON.parse(result.stdout);

      if (response.errors && response.errors.length > 0) {
        throw new GhpError(response.errors[0].message);
      }

      return response.data as T;
    };

    if (retry) {
      const retryOptions: RetryOptions = typeof retry === 'object' ? retry : {};
      return withRetry(doRequest, retryOptions);
    }

    return doRequest();
  }

  getCurrentRepo(): { owner: string; repo: string } | null {
    try {
      const result = this.execSync(['repo', 'view', '--json', 'owner,name']);
      const data = JSON.parse(result);
      return { owner: data.owner.login, repo: data.name };
    } catch {
      return null;
    }
  }

  getCurrentUser(): string | null {
    try {
      const result = this.execSync(['api', 'user', '-q', '.login']);
      return result.trim();
    } catch {
      return null;
    }
  }
}

export const gh = GitHubClient.getInstance();
