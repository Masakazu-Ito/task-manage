import { Command } from 'commander';
import { issueCommand } from './commands/issue/index.js';
import { projectCommand } from './commands/project/index.js';

const program = new Command();

program
  .name('ghp')
  .description('GitHub Issue/Projects v2 management CLI tool')
  .version('1.0.0');

program.addCommand(issueCommand);
program.addCommand(projectCommand);

program.parse();
