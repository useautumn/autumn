import type { ChatApproval } from "@autumn/shared";
import type { ApprovalRunResult } from "../types.js";

/** Nothing parks, so the caller cancelling the row IS the discard: the stored
 * writes simply never run. The agent's turn ended when the card was posted, so
 * there is no session to deny and nothing for it to say. */
export const discardApproval = async (_input: {
	approval: ChatApproval;
	providerUserId: string;
}): Promise<ApprovalRunResult> => ({ result: undefined, text: "" });
