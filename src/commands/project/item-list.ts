import { Command } from 'commander';
import { GraphQLAPI } from '../../lib/github/graphql.js';
import { formatProjectItems, error, type OutputFormat } from '../../lib/output.js';

export const itemListCommand = new Command('item-list')
  .description('List project items')
  .argument('<number>', 'Project number')
  .option('-o, --owner <user|org>', 'Project owner (user or organization)')
  .option('-s, --status <status>', 'Filter by status')
  .option('--json', 'Output as JSON')
  .action(async (number, options) => {
    try {
      const api = new GraphQLAPI(options.owner);
      const projectNumber = Number(number);

      const items = await api.getProjectItems(projectNumber, options.status);

      const format: OutputFormat = options.json ? 'json' : 'table';
      console.log(formatProjectItems(items, format));
    } catch (err) {
      error((err as Error).message);
      process.exit(1);
    }
  });
