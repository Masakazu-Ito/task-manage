import { Command } from 'commander';
import { RestAPI } from '../../lib/github/rest.js';
import { formatIssueList, error, type OutputFormat } from '../../lib/output.js';

export const listCommand = new Command('list')
  .description('List issues in a repository')
  .option('-r, --repo <owner/repo>', 'Repository in owner/repo format')
  .option('-s, --state <state>', 'Filter by state: open, closed, all', 'open')
  .option('-l, --label <labels...>', 'Filter by labels')
  .option('-a, --assignee <user>', 'Filter by assignee')
  .option('-n, --limit <number>', 'Maximum number of issues to list', '30')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      const api = RestAPI.fromRepoString(options.repo);

      const issues = await api.listIssues({
        state: options.state as 'open' | 'closed' | 'all',
        labels: options.label,
        assignee: options.assignee,
        per_page: Number(options.limit),
      });

      const format: OutputFormat = options.json ? 'json' : 'table';
      console.log(formatIssueList(issues, format));
    } catch (err) {
      error((err as Error).message);
      process.exit(1);
    }
  });
