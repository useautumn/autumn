import type { ChatApproval } from "@autumn/shared";
import { resumeClaudeManagedApproval } from "../../harness/claudeManaged/session/resumeApproval.js";
import type { AgentHarnessName } from "../../lib/chatAgentConfig.js";
import type { ApprovalRunResult } from "./types.js";

export type ResumeApprovalFn = (input: {
	approval: ChatApproval;
	onProgress?: (statusLine: string) => void;
	providerUserId: string;
}) => Promise<ApprovalRunResult>;

// Per-harness approval resume. "mastra" has no suspend/resume session model, so
// it has no resumer (the dispatcher errors clearly if one is ever requested).
export const harnessApprovalResumers: Partial<
	Record<AgentHarnessName, ResumeApprovalFn>
> = {
	"claude-managed": resumeClaudeManagedApproval,
};
