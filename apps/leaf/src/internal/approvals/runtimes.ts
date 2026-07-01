import type { ChatApproval } from "@autumn/shared";
import { resumeClaudeManagedApproval } from "../../harness/claudeManaged/approval.js";
import type { AgentHarnessName } from "../../lib/chatAgentConfig.js";
import type { ApprovalRunResult } from "./types.js";

/** The runtime seam: how a given agent runtime resumes an approved write. */
export type ApprovalRuntime = (input: {
	approval: ChatApproval;
	onProgress?: (statusLine: string) => void;
	providerUserId: string;
	token?: string;
}) => Promise<ApprovalRunResult>;

// Registered per harness. "mastra" has no suspend/resume session model, so it
// has no entry (resolveApproval errors clearly if one is ever requested).
export const approvalRuntimes: Partial<Record<AgentHarnessName, ApprovalRuntime>> =
	{
		"claude-managed": resumeClaudeManagedApproval,
	};
