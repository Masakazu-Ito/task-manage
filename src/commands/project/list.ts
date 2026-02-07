import { Command } from 'commander';
import { GraphQLAPI } from '../../lib/github/graphql.js';
import { formatProjectList, error, type OutputFormat } from '../../lib/output.js';

export const listCommand = new Command('list')
  .description('List projects')
  .option('-o, --owner <user|org>', 'Project owner (user or organization)')
  .option('-n, --limit <number>', 'Maximum number of projects to list', '20')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      const api = new GraphQLAPI(options.owner);

      const projects = await api.listProjects(Number(options.limit));

      const format: OutputFormat = options.json ? 'json' : 'table';
      console.log(formatProjectList(projects, format));
    } catch (err) {
      error((err as Error).message);
      process.exit(1);
    }
  });
