import type { ChatApproval } from "@autumn/shared";
import { denyOptionOf } from "../domain/approvalRecord.js";
import type { ApprovalRunResult } from "../types.js";
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
		optionId: denyOptionOf(approval),
		providerUserId,
	});
