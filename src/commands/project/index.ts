import { Command } from 'commander';
import { listCommand } from './list.js';
import { viewCommand } from './view.js';
import { itemListCommand } from './item-list.js';
import { itemAddCommand } from './item-add.js';
import { itemMoveCommand } from './item-move.js';

export const projectCommand = new Command('project')
  .description('Manage GitHub Projects v2');

projectCommand.addCommand(listCommand);
projectCommand.addCommand(viewCommand);
projectCommand.addCommand(itemListCommand);
projectCommand.addCommand(itemAddCommand);
projectCommand.addCommand(itemMoveCommand);
