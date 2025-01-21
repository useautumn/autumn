export type Workflow = {
  id?: string;
  workspace_id?: string;
  created_at?: number;
  last_updated?: number;
  external_id?: string;
  inputs?: Record<string, unknown>;
  file_contents?: string;

  env?: string | null;
  package_json?: string | null;
  typescript_contents?: string;
};

// export enum WorkflowInputType {
//   String = "String",
// }

export type WorkflowInput = {
  name: string;
  type: "string" | "number" | "boolean" | "object";
};
