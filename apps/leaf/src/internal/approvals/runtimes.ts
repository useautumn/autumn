import type { ChatApproval } from "@autumn/shared";
import { resumeClaudeManagedApprovalGroup } from "../../harness/claudeManaged/approval.js";
import { resumeEveApprovalGroup } from "../../harness/eve/approval.js";
import type { AgentHarnessName } from "../../lib/chatAgentConfig.js";
import type { ApprovalGroupRunResult } from "./types.js";

/** The runtime seam: how a given agent runtime resumes an approved group. */
export type ApprovalRuntime = (input: {
	approvals: ChatApproval[];
	onProgress?: (statusLine: string) => void;
	providerUserId: string;
	approverToken?: string;
}) => Promise<ApprovalGroupRunResult>;

// Registered per harness. "mastra" has no suspend/resume session model, so it
// has no entry (resolveApprovalGroup errors clearly if one is ever requested).
export const approvalRuntimes: Partial<
	Record<AgentHarnessName, ApprovalRuntime>
> = {
	"claude-managed": resumeClaudeManagedApprovalGroup,
	eve: resumeEveApprovalGroup,
};
