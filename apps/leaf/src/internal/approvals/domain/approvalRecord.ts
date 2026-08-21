import type { ChatApproval, ChatApprovalStep } from "@autumn/shared";
import {
	childSessionIdsFromToolArgs,
	siblingRequestIdsFromToolArgs,
	type WithheldWrite,
	withheldWritesFromToolArgs,
} from "../../agentRuntime/eve/parkedInput.js";
import { publicToolArgs } from "../utils/toolRequest.js";

/** Column-first accessors for approval rows. The `_eve*` marker fallbacks
 * cover pending rows inserted before the columns existed (≤15-min window per
 * deploy) and can be deleted once no such rows remain. */

const markerString = (approval: ChatApproval, key: string) => {
	const value = (approval.tool_args as Record<string, unknown>)[key];
	return typeof value === "string" ? value : undefined;
};

export const approveOptionOf = (approval: ChatApproval): string =>
	approval.approve_option_id ??
	markerString(approval, "_eveApproveOptionId") ??
	"approve";

export const denyOptionOf = (approval: ChatApproval): string =>
	approval.deny_option_id ??
	markerString(approval, "_eveDenyOptionId") ??
	"deny";

export const siblingRequestIdsOf = (
	approval: ChatApproval,
): ReadonlyArray<string> =>
	approval.sibling_request_ids ??
	siblingRequestIdsFromToolArgs(approval.tool_args);

export const childSessionIdsOf = (
	approval: ChatApproval,
): ReadonlyArray<string> =>
	approval.child_session_ids ?? childSessionIdsFromToolArgs(approval.tool_args);

/** The grouped writes beyond the primary, in execution order. Prefers step
 * rows; falls back to the legacy `_eveWithheldWrites` marker. */
export const withheldStepsOf = ({
	approval,
	steps,
}: {
	approval: ChatApproval;
	steps?: ReadonlyArray<ChatApprovalStep>;
}): ReadonlyArray<WithheldWrite> => {
	const grouped = (steps ?? []).filter((step) => step.position > 0);
	if (grouped.length) {
		return grouped.map((step) => ({
			denyOptionId: step.deny_option_id ?? undefined,
			input: step.tool_args,
			preview: step.preview ?? undefined,
			requestId: step.request_id ?? "",
			toolName: step.tool_name,
		}));
	}
	return withheldWritesFromToolArgs(approval.tool_args);
};

/** Every write on the card — primary first — in execution order. */
export const allWritesOf = ({
	approval,
	steps,
}: {
	approval: ChatApproval;
	steps?: ReadonlyArray<ChatApprovalStep>;
}): ReadonlyArray<WithheldWrite> => [
	{
		denyOptionId: denyOptionOf(approval),
		input: publicToolArgs(approval.tool_args),
		preview: approval.preview ?? undefined,
		requestId: approval.tool_call_id ?? "",
		toolName: approval.tool_name,
	},
	...withheldStepsOf({ approval, steps }),
];
