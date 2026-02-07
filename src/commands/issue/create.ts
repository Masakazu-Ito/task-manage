import { Command } from 'commander';
import { RestAPI } from '../../lib/github/rest.js';
import { formatIssue, success, error, type OutputFormat } from '../../lib/output.js';

export const createCommand = new Command('create')
  .description('Create a new issue')
  .requiredOption('-t, --title <title>', 'Issue title')
  .option('-b, --body <body>', 'Issue body')
  .option('-l, --label <labels...>', 'Labels to add')
  .option('-a, --assignee <users...>', 'Assignees')
  .option('-m, --milestone <number>', 'Milestone number')
  .option('-r, --repo <owner/repo>', 'Repository in owner/repo format')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      const api = RestAPI.fromRepoString(options.repo);

      const issue = await api.createIssue({
        title: options.title,
        body: options.body,
        labels: options.label,
        assignees: options.assignee,
        milestone: options.milestone ? Number(options.milestone) : undefined,
      });

      const format: OutputFormat = options.json ? 'json' : 'table';

      if (!options.json) {
        success(`Created issue #${issue.number}`);
      }
      console.log(formatIssue(issue, format));
    } catch (err) {
      error((err as Error).message);
      process.exit(1);
    }
  });
