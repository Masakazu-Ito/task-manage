export interface Project {
  id: string;
  number: number;
  title: string;
  shortDescription: string | null;
  url: string;
  closed: boolean;
  createdAt: string;
  updatedAt: string;
  owner: {
    login: string;
  };
}

export interface ProjectField {
  id: string;
  name: string;
  dataType: 'TEXT' | 'NUMBER' | 'DATE' | 'SINGLE_SELECT' | 'ITERATION';
  options?: ProjectFieldOption[];
}

export interface ProjectFieldOption {
  id: string;
  name: string;
  color?: string;
}

export interface ProjectItem {
  id: string;
  type: 'ISSUE' | 'PULL_REQUEST' | 'DRAFT_ISSUE';
  content: ProjectItemContent | null;
  fieldValues: ProjectFieldValue[];
}

export interface ProjectItemContent {
  number: number;
  title: string;
  state: string;
  url: string;
}

export interface ProjectFieldValue {
  field: {
    name: string;
  };
  value: string | number | null;
  optionId?: string;
}

export interface ProjectItemRaw {
  id: string;
  type: 'ISSUE' | 'PULL_REQUEST' | 'DRAFT_ISSUE';
  content: ProjectItemContent | null;
  fieldValues: {
    nodes: unknown[];
  };
}

export interface ProjectV2ResponseRaw {
  id: string;
  number: number;
  title: string;
  shortDescription: string | null;
  url: string;
  closed: boolean;
  fields: {
    nodes: ProjectField[];
  };
  items: {
    nodes: ProjectItemRaw[];
    pageInfo: {
      hasNextPage: boolean;
      endCursor: string | null;
    };
  };
}

export interface ProjectV2Response {
  id: string;
  number: number;
  title: string;
  shortDescription: string | null;
  url: string;
  closed: boolean;
  fields: {
    nodes: ProjectField[];
  };
  items: {
    nodes: ProjectItem[];
    pageInfo: {
      hasNextPage: boolean;
      endCursor: string | null;
    };
  };
}
