import { Autumn } from "autumn-js";
import type { WorkspaceConfig } from "@/services/workspace";

export function createAutumnClient(workspace: WorkspaceConfig): Autumn {
	if (!workspace.apiKey) throw new Error("No API key configured");
	return new Autumn({ secretKey: workspace.apiKey });
}
