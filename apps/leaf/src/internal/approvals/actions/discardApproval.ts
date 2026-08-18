import type { ChatApproval } from "@autumn/shared";
import type { ApprovalRunResult } from "../types.js";
import { denyOptionFromApproval } from "./approvalOptions.js";
import { submitApprovalInput } from "./submitApprovalInput.js";

export const discardApproval = async ({
	approval,
	providerUserId,
}: {
	approval: ChatApproval;
	providerUserId: string;
}): Promise<ApprovalRunResult> =>
	submitApprovalInput({
		approval,
		note: "(Dashboard: the user clicked Discard on this change. Acknowledge briefly and ask what they'd like different — they are NOT waiting on any further approval.)",
		optionId: denyOptionFromApproval(approval),
		providerUserId,
	});
