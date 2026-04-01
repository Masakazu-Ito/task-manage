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
  number?: number;    // optional (Draft does not have this)
  title: string;
  state?: string;     // optional (Draft does not have this)
  url?: string;       // optional (Draft does not have this)
  body?: string;      // Draft item body
}

export interface ProjectFieldValue {
  field: {
    name: string;
  };
  value: string | number | null;
  optionId?: string;
}

// ProjectItem からフィールド値を取得するヘルパー
export function getItemFieldValue(item: ProjectItem, fieldName: string): string | number | null {
  const fv = item.fieldValues.find(fv => fv.field.name === fieldName);
  return fv?.value ?? null;
}

// フィールド値入力用の型
export interface FieldValueInput {
  text?: string;
  number?: number;
  date?: string;
  singleSelectOptionId?: string;
}

// フィールド作成用の型
export interface CreateFieldInput {
  name: string;
  dataType: 'TEXT' | 'NUMBER' | 'DATE' | 'SINGLE_SELECT';
  singleSelectOptions?: { name: string; color?: string }[];
}

// フィールド削除結果の型
export interface DeleteFieldResult {
  deletedFieldId: string;
}

// フィルタオプションの型
export interface ItemFilterOptions {
  status?: string;
  priority?: string;
  category?: string;
  dueBefore?: string;
  dueAfter?: string;
}

// ソートオプションの型
export interface ItemSortOptions {
  field: string;
  direction?: 'asc' | 'desc';
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
