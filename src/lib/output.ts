import chalk from 'chalk';
import Table from 'cli-table3';
import type { Issue } from '../types/issue.js';
import type { Project, ProjectItem, ProjectField } from '../types/project.js';

export type OutputFormat = 'table' | 'json';

export function formatIssueList(issues: Issue[], format: OutputFormat = 'table'): string {
  if (format === 'json') {
    return JSON.stringify(issues, null, 2);
  }

  if (issues.length === 0) {
    return chalk.yellow('No issues found.');
  }

  const table = new Table({
    head: [
      chalk.cyan('#'),
      chalk.cyan('Title'),
      chalk.cyan('State'),
      chalk.cyan('Labels'),
      chalk.cyan('Updated'),
    ],
    colWidths: [8, 50, 10, 20, 12],
    wordWrap: true,
  });

  for (const issue of issues) {
    const state = issue.state === 'open'
      ? chalk.green('open')
      : chalk.red('closed');
    const labels = issue.labels.map(l => l.name).join(', ') || '-';
    const updated = formatDate(issue.updated_at);

    table.push([
      chalk.white(`#${issue.number}`),
      issue.title,
      state,
      labels,
      updated,
    ]);
  }

  return table.toString();
}

export function formatIssue(issue: Issue, format: OutputFormat = 'table'): string {
  if (format === 'json') {
    return JSON.stringify(issue, null, 2);
  }

  const state = issue.state === 'open'
    ? chalk.green('open')
    : chalk.red('closed');
  const labels = issue.labels.map(l => chalk.magenta(l.name)).join(', ') || '-';

  const lines = [
    `${chalk.bold(`#${issue.number}`)} ${issue.title}`,
    `${chalk.gray('State:')} ${state}`,
    `${chalk.gray('Labels:')} ${labels}`,
    `${chalk.gray('Author:')} ${issue.user.login}`,
    `${chalk.gray('Created:')} ${formatDate(issue.created_at)}`,
    `${chalk.gray('Updated:')} ${formatDate(issue.updated_at)}`,
    `${chalk.gray('URL:')} ${issue.html_url}`,
  ];

  if (issue.body) {
    lines.push('', chalk.gray('---'), issue.body);
  }

  return lines.join('\n');
}

export function formatProjectList(projects: Project[], format: OutputFormat = 'table'): string {
  if (format === 'json') {
    return JSON.stringify(projects, null, 2);
  }

  if (projects.length === 0) {
    return chalk.yellow('No projects found.');
  }

  const table = new Table({
    head: [
      chalk.cyan('#'),
      chalk.cyan('Title'),
      chalk.cyan('Owner'),
      chalk.cyan('Status'),
      chalk.cyan('Updated'),
    ],
    colWidths: [8, 40, 20, 10, 12],
    wordWrap: true,
  });

  for (const project of projects) {
    const status = project.closed
      ? chalk.red('closed')
      : chalk.green('open');
    const updated = formatDate(project.updatedAt);

    table.push([
      chalk.white(`#${project.number}`),
      project.title,
      project.owner.login,
      status,
      updated,
    ]);
  }

  return table.toString();
}

export function formatProjectView(
  project: Project,
  fields: ProjectField[],
  items: ProjectItem[],
  format: OutputFormat = 'table'
): string {
  if (format === 'json') {
    return JSON.stringify({ project, fields, items }, null, 2);
  }

  const status = project.closed
    ? chalk.red('closed')
    : chalk.green('open');

  const lines = [
    chalk.bold(`#${project.number} ${project.title}`),
    `${chalk.gray('Status:')} ${status}`,
    `${chalk.gray('Owner:')} ${project.owner.login}`,
    `${chalk.gray('URL:')} ${project.url}`,
  ];

  if (project.shortDescription) {
    lines.push(`${chalk.gray('Description:')} ${project.shortDescription}`);
  }

  lines.push('', chalk.cyan('Fields:'));
  for (const field of fields) {
    let fieldInfo = `  - ${field.name} (${field.dataType})`;
    if (field.options && field.options.length > 0) {
      const optionNames = field.options.map(o => o.name).join(', ');
      fieldInfo += `: ${optionNames}`;
    }
    lines.push(fieldInfo);
  }

  lines.push('', chalk.cyan(`Items (${items.length}):`));
  if (items.length > 0) {
    const table = new Table({
      head: [
        chalk.cyan('ID'),
        chalk.cyan('Type'),
        chalk.cyan('Title'),
        chalk.cyan('Status'),
      ],
      colWidths: [20, 15, 40, 15],
      wordWrap: true,
    });

    for (const item of items) {
      const title = item.content?.title || '(Draft)';
      const statusField = item.fieldValues.find(f => f.field.name === 'Status');
      const status = statusField?.value as string || '-';

      table.push([
        item.id.slice(-12),
        item.type,
        title,
        status,
      ]);
    }

    lines.push(table.toString());
  }

  return lines.join('\n');
}

export function formatProjectItems(
  items: ProjectItem[],
  format: OutputFormat = 'table'
): string {
  if (format === 'json') {
    return JSON.stringify(items, null, 2);
  }

  if (items.length === 0) {
    return chalk.yellow('No items found.');
  }

  const table = new Table({
    head: [
      chalk.cyan('Item ID'),
      chalk.cyan('Type'),
      chalk.cyan('#'),
      chalk.cyan('Title'),
      chalk.cyan('Status'),
    ],
    colWidths: [15, 15, 8, 40, 15],
    wordWrap: true,
  });

  for (const item of items) {
    const number = item.content?.number ? `#${item.content.number}` : '-';
    const title = item.content?.title || '(Draft)';
    const statusField = item.fieldValues.find(f => f.field.name === 'Status');
    const status = statusField?.value as string || '-';

    table.push([
      item.id.slice(-12),
      item.type,
      number,
      title,
      status,
    ]);
  }

  return table.toString();
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function success(message: string): void {
  console.log(chalk.green('✓'), message);
}

export function error(message: string): void {
  console.error(chalk.red('✗'), message);
}

export function info(message: string): void {
  console.log(chalk.blue('ℹ'), message);
}
