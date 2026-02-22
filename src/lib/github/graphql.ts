import { gh } from './client.js';
import type {
  Project,
  ProjectField,
  ProjectItem,
  ProjectV2Response,
  ProjectV2ResponseRaw,
  CreateFieldInput,
  DeleteFieldResult,
  FieldValueInput,
  ItemFilterOptions,
  ItemSortOptions,
} from '../../types/project.js';
import { getDefaultOwner } from '../config.js';

export class GraphQLAPI {
  private owner: string;
  private ownerType: 'user' | 'organization';

  constructor(owner?: string, ownerType?: 'user' | 'organization') {
    // Priority: CLI option > config default > git/user detection
    const effectiveOwner = owner || getDefaultOwner();

    if (effectiveOwner) {
      this.owner = effectiveOwner;
      this.ownerType = ownerType || 'organization';
    } else {
      const current = gh.getCurrentRepo();
      if (current) {
        this.owner = current.owner;
        // Default to organization, will fall back to user if needed
        this.ownerType = 'organization';
      } else {
        const user = gh.getCurrentUser();
        if (user) {
          this.owner = user;
          this.ownerType = 'user';
        } else {
          throw new Error('Could not determine owner. Use --owner option.');
        }
      }
    }
  }

  async listProjects(first: number = 20): Promise<Project[]> {
    const query = `
      query($owner: String!, $first: Int!) {
        ${this.ownerType === 'organization' ? 'organization' : 'user'}(login: $owner) {
          projectsV2(first: $first) {
            nodes {
              id
              number
              title
              shortDescription
              url
              closed
              createdAt
              updatedAt
            }
          }
        }
      }
    `;

    try {
      const result = await gh.graphql<{
        organization?: { projectsV2: { nodes: Project[] } };
        user?: { projectsV2: { nodes: Project[] } };
      }>(query, { owner: this.owner, first });

      const projects = result.organization?.projectsV2.nodes || result.user?.projectsV2.nodes || [];
      return projects.map(p => ({ ...p, owner: { login: this.owner } }));
    } catch {
      // Try the other type if first attempt fails
      if (this.ownerType === 'organization') {
        this.ownerType = 'user';
        return this.listProjects(first);
      }
      throw new Error(`Could not find projects for ${this.owner}`);
    }
  }

  async getProject(number: number): Promise<ProjectV2Response> {
    const query = `
      query($owner: String!, $number: Int!) {
        ${this.ownerType === 'organization' ? 'organization' : 'user'}(login: $owner) {
          projectV2(number: $number) {
            id
            number
            title
            shortDescription
            url
            closed
            fields(first: 50) {
              nodes {
                ... on ProjectV2Field {
                  id
                  name
                  dataType
                }
                ... on ProjectV2SingleSelectField {
                  id
                  name
                  dataType
                  options {
                    id
                    name
                    color
                  }
                }
                ... on ProjectV2IterationField {
                  id
                  name
                  dataType
                }
              }
            }
            items(first: 100) {
              nodes {
                id
                type
                content {
                  ... on Issue {
                    number
                    title
                    state
                    url
                  }
                  ... on PullRequest {
                    number
                    title
                    state
                    url
                  }
                  ... on DraftIssue {
                    title
                    body
                  }
                }
                fieldValues(first: 20) {
                  nodes {
                    ... on ProjectV2ItemFieldTextValue {
                      field { ... on ProjectV2Field { name } }
                      text
                    }
                    ... on ProjectV2ItemFieldNumberValue {
                      field { ... on ProjectV2Field { name } }
                      number
                    }
                    ... on ProjectV2ItemFieldSingleSelectValue {
                      field { ... on ProjectV2SingleSelectField { name } }
                      name
                      optionId
                    }
                    ... on ProjectV2ItemFieldDateValue {
                      field { ... on ProjectV2Field { name } }
                      date
                    }
                  }
                }
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        }
      }
    `;

    try {
      const result = await gh.graphql<{
        organization?: { projectV2: ProjectV2ResponseRaw };
        user?: { projectV2: ProjectV2ResponseRaw };
      }>(query, { owner: this.owner, number });

      const projectRaw = result.organization?.projectV2 || result.user?.projectV2;
      if (!projectRaw) {
        throw new Error(`Project #${number} not found`);
      }

      // Transform field values
      const items: ProjectItem[] = projectRaw.items.nodes.map(item => ({
        ...item,
        fieldValues: item.fieldValues.nodes
          .filter((fv: unknown): fv is { field: { name: string }; text?: string; number?: number; name?: string; date?: string; optionId?: string } =>
            fv !== null && typeof fv === 'object' && 'field' in fv
          )
          .map((fv: { field: { name: string }; text?: string; number?: number; name?: string; date?: string; optionId?: string }) => ({
            field: fv.field,
            value: fv.text ?? fv.number ?? fv.name ?? fv.date ?? null,
            optionId: fv.optionId,
          })),
      }));

      return {
        ...projectRaw,
        items: { ...projectRaw.items, nodes: items },
      } as ProjectV2Response;
    } catch (err) {
      if (this.ownerType === 'organization') {
        this.ownerType = 'user';
        return this.getProject(number);
      }
      throw err;
    }
  }

  async getProjectItems(number: number, statusFilter?: string): Promise<ProjectItem[]> {
    const project = await this.getProject(number);
    let items = project.items.nodes;

    if (statusFilter) {
      items = items.filter(item => {
        const statusField = item.fieldValues.find(fv => fv.field.name === 'Status');
        return statusField?.value === statusFilter;
      });
    }

    return items;
  }

  async getProjectFields(number: number): Promise<ProjectField[]> {
    const project = await this.getProject(number);
    return project.fields.nodes;
  }

  async addItemToProject(projectNumber: number, issueNumber: number, repo?: string): Promise<string> {
    // First, get the project ID
    const project = await this.getProject(projectNumber);

    // Get the issue/PR node ID
    let repoOwner = this.owner;
    let repoName: string;

    if (repo) {
      const [o, r] = repo.split('/');
      repoOwner = o;
      repoName = r;
    } else {
      const currentRepo = gh.getCurrentRepo();
      if (!currentRepo) {
        throw new Error('Could not determine repository. Use --repo option.');
      }
      repoOwner = currentRepo.owner;
      repoName = currentRepo.repo;
    }

    // Get issue node ID
    const issueQuery = `
      query($owner: String!, $repo: String!, $number: Int!) {
        repository(owner: $owner, name: $repo) {
          issue(number: $number) {
            id
          }
        }
      }
    `;

    const issueResult = await gh.graphql<{
      repository: { issue: { id: string } | null };
    }>(issueQuery, { owner: repoOwner, repo: repoName, number: issueNumber });

    if (!issueResult.repository.issue) {
      throw new Error(`Issue #${issueNumber} not found in ${repoOwner}/${repoName}`);
    }

    const contentId = issueResult.repository.issue.id;

    // Add item to project
    const mutation = `
      mutation($projectId: ID!, $contentId: ID!) {
        addProjectV2ItemById(input: {
          projectId: $projectId
          contentId: $contentId
        }) {
          item {
            id
          }
        }
      }
    `;

    const result = await gh.graphql<{
      addProjectV2ItemById: { item: { id: string } };
    }>(mutation, { projectId: project.id, contentId });

    return result.addProjectV2ItemById.item.id;
  }

  async moveItem(projectNumber: number, itemId: string, status: string): Promise<void> {
    const project = await this.getProject(projectNumber);

    // Find the Status field
    const statusField = project.fields.nodes.find(
      f => f.name === 'Status' && f.dataType === 'SINGLE_SELECT'
    );

    if (!statusField) {
      throw new Error('Status field not found in project');
    }

    // Find the option ID for the target status
    const option = statusField.options?.find(
      o => o.name.toLowerCase() === status.toLowerCase()
    );

    if (!option) {
      const availableOptions = statusField.options?.map(o => o.name).join(', ') || 'none';
      throw new Error(`Status "${status}" not found. Available: ${availableOptions}`);
    }

    // Update the item's status
    const mutation = `
      mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
        updateProjectV2ItemFieldValue(input: {
          projectId: $projectId
          itemId: $itemId
          fieldId: $fieldId
          value: { singleSelectOptionId: $optionId }
        }) {
          projectV2Item {
            id
          }
        }
      }
    `;

    await gh.graphql(mutation, {
      projectId: project.id,
      itemId,
      fieldId: statusField.id,
      optionId: option.id,
    });
  }

  async findItemByIssueNumber(projectNumber: number, issueNumber: number): Promise<ProjectItem | null> {
    const items = await this.getProjectItems(projectNumber);
    return items.find(item => item.content?.number === issueNumber) || null;
  }

  async createField(projectNumber: number, input: CreateFieldInput): Promise<ProjectField> {
    const project = await this.getProject(projectNumber);

    if (input.dataType === 'SINGLE_SELECT') {
      const mutation = `
        mutation($projectId: ID!, $name: String!, $options: [ProjectV2SingleSelectFieldOptionInput!]!) {
          createProjectV2Field(input: {
            projectId: $projectId
            dataType: SINGLE_SELECT
            name: $name
            singleSelectOptions: $options
          }) {
            projectV2Field {
              ... on ProjectV2SingleSelectField {
                id
                name
                dataType
                options {
                  id
                  name
                  color
                }
              }
            }
          }
        }
      `;

      const options = (input.singleSelectOptions || []).map(opt => ({
        name: opt.name,
        color: opt.color || 'GRAY',
      }));

      const result = await gh.graphql<{
        createProjectV2Field: { projectV2Field: ProjectField };
      }>(mutation, {
        projectId: project.id,
        name: input.name,
        options,
      });

      return result.createProjectV2Field.projectV2Field;
    } else {
      const mutation = `
        mutation($projectId: ID!, $name: String!, $dataType: ProjectV2CustomFieldType!) {
          createProjectV2Field(input: {
            projectId: $projectId
            dataType: $dataType
            name: $name
          }) {
            projectV2Field {
              ... on ProjectV2Field {
                id
                name
                dataType
              }
            }
          }
        }
      `;

      const result = await gh.graphql<{
        createProjectV2Field: { projectV2Field: ProjectField };
      }>(mutation, {
        projectId: project.id,
        name: input.name,
        dataType: input.dataType,
      });

      return result.createProjectV2Field.projectV2Field;
    }
  }

  async deleteField(projectNumber: number, fieldName: string): Promise<DeleteFieldResult> {
    const project = await this.getProject(projectNumber);
    const field = project.fields.nodes.find(f => f.name === fieldName);

    if (!field) {
      throw new Error(`Field "${fieldName}" not found in project`);
    }

    const mutation = `
      mutation($fieldId: ID!) {
        deleteProjectV2Field(input: {
          fieldId: $fieldId
        }) {
          projectV2Field {
            ... on ProjectV2Field {
              id
            }
            ... on ProjectV2SingleSelectField {
              id
            }
          }
        }
      }
    `;

    await gh.graphql(mutation, { fieldId: field.id });

    return { deletedFieldId: field.id };
  }

  async updateItemFieldValue(
    projectNumber: number,
    itemId: string,
    fieldName: string,
    value: FieldValueInput
  ): Promise<void> {
    const project = await this.getProject(projectNumber);
    const field = project.fields.nodes.find(f => f.name === fieldName);

    if (!field) {
      throw new Error(`Field "${fieldName}" not found in project`);
    }

    await this.sendFieldValueMutation(project.id, itemId, field.id, value);
  }

  async setItemFieldByValue(
    projectNumber: number,
    itemId: string,
    fieldName: string,
    value: string | number
  ): Promise<void> {
    const project = await this.getProject(projectNumber);
    const field = project.fields.nodes.find(f => f.name === fieldName);

    if (!field) {
      throw new Error(`Field "${fieldName}" not found in project`);
    }

    let fieldValue: FieldValueInput;

    switch (field.dataType) {
      case 'TEXT':
        fieldValue = { text: String(value) };
        break;
      case 'NUMBER':
        fieldValue = { number: Number(value) };
        break;
      case 'DATE':
        fieldValue = { date: String(value) };
        break;
      case 'SINGLE_SELECT': {
        const option = field.options?.find(
          o => o.name.toLowerCase() === String(value).toLowerCase()
        );
        if (!option) {
          const availableOptions = field.options?.map(o => o.name).join(', ') || 'none';
          throw new Error(`Option "${value}" not found for field "${fieldName}". Available: ${availableOptions}`);
        }
        fieldValue = { singleSelectOptionId: option.id };
        break;
      }
      default:
        throw new Error(`Unsupported field type: ${field.dataType}`);
    }

    await this.sendFieldValueMutation(project.id, itemId, field.id, fieldValue);
  }

  private async sendFieldValueMutation(
    projectId: string,
    itemId: string,
    fieldId: string,
    value: FieldValueInput
  ): Promise<void> {
    // Build mutation with the specific value type inlined (not as ProjectV2FieldValue variable)
    // gh CLI cannot properly pass nested JSON input types as variables
    let valueDef: string;
    let valueVar: string;
    const variables: Record<string, unknown> = {
      projectId,
      itemId,
      fieldId,
    };

    if (value.text !== undefined) {
      valueDef = '$val: String!';
      valueVar = '{ text: $val }';
      variables.val = value.text;
    } else if (value.number !== undefined) {
      valueDef = '$val: Float!';
      valueVar = '{ number: $val }';
      variables.val = value.number;
    } else if (value.date !== undefined) {
      valueDef = '$val: Date!';
      valueVar = '{ date: $val }';
      variables.val = value.date;
    } else if (value.singleSelectOptionId !== undefined) {
      valueDef = '$val: String!';
      valueVar = '{ singleSelectOptionId: $val }';
      variables.val = value.singleSelectOptionId;
    } else {
      throw new Error('No valid value provided');
    }

    const mutation = `
      mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, ${valueDef}) {
        updateProjectV2ItemFieldValue(input: {
          projectId: $projectId
          itemId: $itemId
          fieldId: $fieldId
          value: ${valueVar}
        }) {
          projectV2Item {
            id
          }
        }
      }
    `;

    await gh.graphql(mutation, variables);
  }

  async getProjectItemsFiltered(
    number: number,
    filters?: ItemFilterOptions,
    sort?: ItemSortOptions
  ): Promise<ProjectItem[]> {
    const project = await this.getProject(number);
    let items = project.items.nodes;

    // Apply filters
    if (filters) {
      items = items.filter(item => {
        const getFieldValue = (fieldName: string): string | number | null => {
          const fv = item.fieldValues.find(f => f.field.name === fieldName);
          return fv?.value ?? null;
        };

        if (filters.status) {
          const status = getFieldValue('Status');
          if (status !== filters.status) return false;
        }

        if (filters.priority) {
          const priority = getFieldValue('Priority');
          if (priority !== filters.priority) return false;
        }

        if (filters.category) {
          const category = getFieldValue('Category');
          if (category !== filters.category) return false;
        }

        if (filters.dueBefore) {
          const dueDate = getFieldValue('Due Date');
          if (!dueDate || String(dueDate) > filters.dueBefore) return false;
        }

        if (filters.dueAfter) {
          const dueDate = getFieldValue('Due Date');
          if (!dueDate || String(dueDate) < filters.dueAfter) return false;
        }

        return true;
      });
    }

    // Apply sorting
    if (sort) {
      items = [...items].sort((a, b) => {
        const aValue = a.fieldValues.find(f => f.field.name === sort.field)?.value;
        const bValue = b.fieldValues.find(f => f.field.name === sort.field)?.value;

        if (aValue === null || aValue === undefined) return 1;
        if (bValue === null || bValue === undefined) return -1;

        let comparison = 0;
        if (typeof aValue === 'number' && typeof bValue === 'number') {
          comparison = aValue - bValue;
        } else {
          comparison = String(aValue).localeCompare(String(bValue));
        }

        return sort.direction === 'desc' ? -comparison : comparison;
      });
    }

    return items;
  }

  async addDraftItem(projectNumber: number, title: string, body?: string): Promise<string> {
    const project = await this.getProject(projectNumber);

    const mutation = `
      mutation($projectId: ID!, $title: String!, $body: String) {
        addProjectV2DraftIssue(input: {
          projectId: $projectId
          title: $title
          body: $body
        }) {
          projectItem {
            id
          }
        }
      }
    `;

    const result = await gh.graphql<{
      addProjectV2DraftIssue: { projectItem: { id: string } };
    }>(mutation, {
      projectId: project.id,
      title,
      body: body || null,
    });

    return result.addProjectV2DraftIssue.projectItem.id;
  }

  async getRepositoryId(owner: string, repo: string): Promise<string> {
    const query = `
      query($owner: String!, $repo: String!) {
        repository(owner: $owner, name: $repo) {
          id
        }
      }
    `;

    const result = await gh.graphql<{
      repository: { id: string } | null;
    }>(query, { owner, repo });

    if (!result.repository) {
      throw new Error(`Repository ${owner}/${repo} not found`);
    }

    return result.repository.id;
  }

  async convertDraftToIssue(projectNumber: number, itemId: string, repositoryId: string): Promise<{ issueId: string; issueNumber: number; issueUrl: string }> {
    const project = await this.getProject(projectNumber);

    const mutation = `
      mutation($projectId: ID!, $itemId: ID!, $repositoryId: ID!) {
        convertProjectV2DraftIssueItemToIssue(input: {
          projectId: $projectId
          itemId: $itemId
          repositoryId: $repositoryId
        }) {
          item {
            id
            content {
              ... on Issue {
                id
                number
                url
              }
            }
          }
        }
      }
    `;

    const result = await gh.graphql<{
      convertProjectV2DraftIssueItemToIssue: {
        item: {
          id: string;
          content: { id: string; number: number; url: string };
        };
      };
    }>(mutation, {
      projectId: project.id,
      itemId,
      repositoryId,
    });

    const content = result.convertProjectV2DraftIssueItemToIssue.item.content;
    return {
      issueId: content.id,
      issueNumber: content.number,
      issueUrl: content.url,
    };
  }
}
