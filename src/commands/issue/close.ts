import { Command } from 'commander';
import { RestAPI } from '../../lib/github/rest.js';
import { formatIssue, success, error, type OutputFormat } from '../../lib/output.js';

export const closeCommand = new Command('close')
  .description('Close an issue')
  .argument('<number>', 'Issue number')
  .option('-c, --comment <comment>', 'Add a closing comment')
  .option('-r, --repo <owner/repo>', 'Repository in owner/repo format')
  .option('--json', 'Output as JSON')
  .action(async (number, options) => {
    try {
      const api = RestAPI.fromRepoString(options.repo);
      const issueNumber = Number(number);

      const issue = await api.closeIssue(issueNumber, options.comment);

      const format: OutputFormat = options.json ? 'json' : 'table';

      if (!options.json) {
        success(`Closed issue #${issueNumber}`);
      }
      console.log(formatIssue(issue, format));
    } catch (err) {
      error((err as Error).message);
      process.exit(1);
    }
  });
