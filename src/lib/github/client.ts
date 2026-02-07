import { execSync, exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

export interface ExecResult {
  stdout: string;
  stderr: string;
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
    const command = ['gh', ...args].join(' ');
    try {
      const result = await execAsync(command);
      return {
        stdout: result.stdout,
        stderr: result.stderr,
      };
    } catch (err: unknown) {
      const error = err as { stdout?: string; stderr?: string; message?: string };
      throw new Error(error.stderr || error.message || 'gh command failed');
    }
  }

  execSync(args: string[]): string {
    const command = ['gh', ...args].join(' ');
    try {
      return execSync(command, { encoding: 'utf-8' });
    } catch (err: unknown) {
      const error = err as { stderr?: Buffer; message?: string };
      throw new Error(error.stderr?.toString() || error.message || 'gh command failed');
    }
  }

  async api<T>(endpoint: string, options: {
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    body?: Record<string, unknown>;
    headers?: Record<string, string>;
  } = {}): Promise<T> {
    const args = ['api', endpoint];

    if (options.method) {
      args.push('-X', options.method);
    }

    if (options.body) {
      args.push('-f', ...Object.entries(options.body).flatMap(([k, v]) => {
        if (typeof v === 'string') {
          return [`${k}=${v}`];
        }
        return [`${k}=${JSON.stringify(v)}`];
      }));
    }

    if (options.headers) {
      for (const [key, value] of Object.entries(options.headers)) {
        args.push('-H', `${key}: ${value}`);
      }
    }

    const result = await this.exec(args);
    if (!result.stdout.trim()) {
      return {} as T;
    }
    return JSON.parse(result.stdout) as T;
  }

  async graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const args = ['api', 'graphql'];

    args.push('-f', `query=${query}`);

    if (variables) {
      for (const [key, value] of Object.entries(variables)) {
        if (typeof value === 'string') {
          args.push('-f', `${key}=${value}`);
        } else if (typeof value === 'number' || typeof value === 'boolean') {
          args.push('-F', `${key}=${value}`);
        } else {
          args.push('-f', `${key}=${JSON.stringify(value)}`);
        }
      }
    }

    const result = await this.exec(args);
    const response = JSON.parse(result.stdout);

    if (response.errors && response.errors.length > 0) {
      throw new Error(response.errors[0].message);
    }

    return response.data as T;
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
