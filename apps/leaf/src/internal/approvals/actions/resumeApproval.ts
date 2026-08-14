import type { ChatApproval } from "@autumn/shared";
import type { ApprovalRunResult } from "../types.js";
import { approveOptionFromApproval } from "./approvalOptions.js";
import { submitApprovalInput } from "./submitApprovalInput.js";

export const resumeApproval = async ({
	approval,
	providerUserId,
}: {
	approval: ChatApproval;
	providerUserId: string;
}): Promise<ApprovalRunResult> =>
	submitApprovalInput({
		approval,
		expectExecution: true,
		optionId: approveOptionFromApproval(approval),
		providerUserId,
	});
