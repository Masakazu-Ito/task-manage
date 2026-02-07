import { Command } from 'commander';
import { RestAPI } from '../../lib/github/rest.js';
import { formatIssue, success, error, type OutputFormat } from '../../lib/output.js';

export const updateCommand = new Command('update')
  .description('Update an issue')
  .argument('<number>', 'Issue number')
  .option('-t, --title <title>', 'New title')
  .option('-b, --body <body>', 'New body')
  .option('--add-label <labels...>', 'Labels to add')
  .option('--remove-label <labels...>', 'Labels to remove')
  .option('--add-assignee <users...>', 'Assignees to add')
  .option('-m, --milestone <number>', 'Milestone number (use "none" to remove)')
  .option('-r, --repo <owner/repo>', 'Repository in owner/repo format')
  .option('--json', 'Output as JSON')
  .action(async (number, options) => {
    try {
      const api = RestAPI.fromRepoString(options.repo);
      const issueNumber = Number(number);

      // Handle label removal first if specified
      if (options.removeLabel && options.removeLabel.length > 0) {
        await api.removeLabels(issueNumber, options.removeLabel);
      }

      // Build update params
      const updateParams: {
        title?: string;
        body?: string;
        labels?: string[];
        assignees?: string[];
        milestone?: number | null;
      } = {};

      if (options.title) updateParams.title = options.title;
      if (options.body) updateParams.body = options.body;
      if (options.addLabel) updateParams.labels = options.addLabel;
      if (options.addAssignee) updateParams.assignees = options.addAssignee;
      if (options.milestone !== undefined) {
        updateParams.milestone = options.milestone === 'none' ? null : Number(options.milestone);
      }

      let issue;
      if (Object.keys(updateParams).length > 0) {
        issue = await api.updateIssue(issueNumber, updateParams);
      } else if (!options.removeLabel) {
        error('No update options specified');
        process.exit(1);
      } else {
        // Only labels were removed, fetch the updated issue
        issue = await api.getIssue(issueNumber);
      }

      const format: OutputFormat = options.json ? 'json' : 'table';

      if (!options.json) {
        success(`Updated issue #${issueNumber}`);
      }
      console.log(formatIssue(issue, format));
    } catch (err) {
      error((err as Error).message);
      process.exit(1);
    }
  });
