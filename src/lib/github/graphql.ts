import { gh } from './client.js';
import type { Project, ProjectField, ProjectItem, ProjectV2Response, ProjectV2ResponseRaw } from '../../types/project.js';

export class GraphQLAPI {
  private owner: string;
  private ownerType: 'user' | 'organization';

  constructor(owner?: string, ownerType?: 'user' | 'organization') {
    if (owner) {
      this.owner = owner;
      this.ownerType = ownerType || 'user';
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
}
