import type { ChatApproval, ChatApprovalWrite } from "@autumn/shared";
import type { PendingApprovalNote } from "../../agentRuntime/domain/agentTurnContext.js";
import { normalizeToolName } from "../../agentRuntime/tools/toolPolicy.js";
import { withoutApprovalDescription } from "../utils/approvalDescription.js";
import { publicToolArgs, toolRequestFromArgs } from "../utils/toolRequest.js";
import { allWritesOf } from "./approvalRecord.js";

const requestBodyOf = (input: Record<string, unknown>) => {
	const args = withoutApprovalDescription(
		publicToolArgs(input, { includeWithheld: false }),
	);
	return withoutApprovalDescription(toolRequestFromArgs(args) ?? {});
};

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
