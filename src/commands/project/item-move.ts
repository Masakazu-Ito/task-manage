import { Command } from 'commander';
import { GraphQLAPI } from '../../lib/github/graphql.js';
import { success, error, info } from '../../lib/output.js';

export const itemMoveCommand = new Command('item-move')
  .description('Move a project item to a different status')
  .argument('<number>', 'Project number')
  .argument('<item-id>', 'Item ID (or issue number with --issue flag)')
  .requiredOption('-s, --status <status>', 'Target status')
  .option('-o, --owner <user|org>', 'Project owner (user or organization)')
  .option('-i, --issue', 'Treat the second argument as an issue number instead of item ID')
  .option('--json', 'Output as JSON')
  .action(async (number, itemIdOrIssue, options) => {
    try {
      const api = new GraphQLAPI(options.owner);
      const projectNumber = Number(number);

      let itemId = itemIdOrIssue;

      // If --issue flag is set, find the item by issue number
      if (options.issue) {
        const issueNumber = Number(itemIdOrIssue);
        const item = await api.findItemByIssueNumber(projectNumber, issueNumber);

        if (!item) {
          throw new Error(`Issue #${issueNumber} not found in project #${projectNumber}`);
        }

        itemId = item.id;
        info(`Found item ${itemId.slice(-12)} for issue #${issueNumber}`);
      }

      await api.moveItem(projectNumber, itemId, options.status);

      if (options.json) {
        console.log(JSON.stringify({
          success: true,
          projectNumber,
          itemId,
          status: options.status,
        }, null, 2));
      } else {
        success(`Moved item to "${options.status}"`);
      }
    } catch (err) {
      error((err as Error).message);
      process.exit(1);
    }
  });
