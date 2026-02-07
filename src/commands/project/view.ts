import { Command } from 'commander';
import { GraphQLAPI } from '../../lib/github/graphql.js';
import { formatProjectView, error, type OutputFormat } from '../../lib/output.js';

export const viewCommand = new Command('view')
  .description('View project details')
  .argument('<number>', 'Project number')
  .option('-o, --owner <user|org>', 'Project owner (user or organization)')
  .option('--json', 'Output as JSON')
  .action(async (number, options) => {
    try {
      const api = new GraphQLAPI(options.owner);
      const projectNumber = Number(number);

      const project = await api.getProject(projectNumber);

      const format: OutputFormat = options.json ? 'json' : 'table';
      console.log(formatProjectView(
        { ...project, owner: { login: options.owner || 'unknown' }, createdAt: '', updatedAt: '' },
        project.fields.nodes,
        project.items.nodes,
        format
      ));
    } catch (err) {
      error((err as Error).message);
      process.exit(1);
    }
  });
