import type { ChatApproval } from "@autumn/shared";
import { approveOptionOf } from "../domain/approvalRecord.js";
import type { SubmittedApprovalResult } from "../types.js";
import { submitApprovalInput } from "./submitApprovalInput.js";

export const resumeApproval = async ({
	approval,
	providerUserId,
}: {
	approval: ChatApproval;
	providerUserId: string;
}): Promise<SubmittedApprovalResult> =>
	submitApprovalInput({
		approval,
		expectExecution: true,
		optionId: approveOptionOf(approval),
		providerUserId,
	});
