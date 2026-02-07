import { Command } from 'commander';
import { GraphQLAPI } from '../../lib/github/graphql.js';
import { success, error } from '../../lib/output.js';

export const itemAddCommand = new Command('item-add')
  .description('Add an issue to a project')
  .argument('<number>', 'Project number')
  .requiredOption('-i, --issue <number>', 'Issue number to add')
  .option('-o, --owner <user|org>', 'Project owner (user or organization)')
  .option('-r, --repo <owner/repo>', 'Repository containing the issue')
  .option('--json', 'Output as JSON')
  .action(async (number, options) => {
    try {
      const api = new GraphQLAPI(options.owner);
      const projectNumber = Number(number);
      const issueNumber = Number(options.issue);

      const itemId = await api.addItemToProject(projectNumber, issueNumber, options.repo);

      if (options.json) {
        console.log(JSON.stringify({ itemId, projectNumber, issueNumber }, null, 2));
      } else {
        success(`Added issue #${issueNumber} to project #${projectNumber}`);
        console.log(`Item ID: ${itemId}`);
      }
    } catch (err) {
      error((err as Error).message);
      process.exit(1);
    }
  });
