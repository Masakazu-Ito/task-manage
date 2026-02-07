import { Command } from 'commander';
import { listCommand } from './list.js';
import { createCommand } from './create.js';
import { updateCommand } from './update.js';
import { closeCommand } from './close.js';

export const issueCommand = new Command('issue')
  .description('Manage GitHub issues');

issueCommand.addCommand(listCommand);
issueCommand.addCommand(createCommand);
issueCommand.addCommand(updateCommand);
issueCommand.addCommand(closeCommand);
