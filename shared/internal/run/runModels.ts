export type LogEntry = {
  level: "info" | "error" | "warn" | "debug";
  name: string;
  msg: string;
  timestamp: number;
};

export type LogGroup = {
  name: string;
  id: string;
  logs: LogEntry[];
};

export type WorkflowRun = {
  id: string;
  created_at: number;
  workspace_id: string;

  logs: LogGroup;
  inputs: Record<string, any>;

  status: "running" | "completed" | "failed";

  workflow: {
    id: string;
    external_id: string;
  };
  // status: "pending" | "running" | "completed" | "failed";
};
