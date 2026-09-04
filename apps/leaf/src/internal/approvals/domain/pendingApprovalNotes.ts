import type { ChatApproval, ChatApprovalWrite } from "@autumn/shared";
import type { PendingApprovalNote } from "../../agentRuntime/domain/agentTurnContext.js";
import { normalizeToolName } from "../../agentRuntime/tools/toolPolicy.js";
import { withoutApprovalDescription } from "../utils/approvalDescription.js";
import { publicToolArgs, toolRequestFromArgs } from "../utils/toolRequest.js";
import { allWritesOf } from "./approvalRecord.js";

/** The request body as the model issued it: harness markers and the card
 * walkthrough stripped, the MCP `request` wrapper unwrapped. */
const requestBodyOf = (input: Record<string, unknown>) => {
	const args = withoutApprovalDescription(
		publicToolArgs(input, { includeWithheld: false }),
	);
	return withoutApprovalDescription(toolRequestFromArgs(args) ?? {});
};

/** Pending cards as the exact write bodies they carry, oldest card first —
 * the repo lists newest first, but the model reads the cards in the order
 * they were posted. */
export const pendingApprovalNotes = ({
	approvals,
	writesByApprovalId,
}: {
	approvals: ReadonlyArray<ChatApproval>;
	writesByApprovalId: ReadonlyMap<string, ReadonlyArray<ChatApprovalWrite>>;
}): ReadonlyArray<PendingApprovalNote> =>
	[...approvals].reverse().map((approval) => ({
		writes: allWritesOf({
			approval,
			writes: writesByApprovalId.get(approval.id),
		}).map((write) => ({
			request: requestBodyOf(write.input ?? {}),
			toolName: normalizeToolName(write.toolName),
		})),
	}));
