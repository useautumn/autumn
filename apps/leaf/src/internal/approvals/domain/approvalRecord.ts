import type { ChatApproval, ChatApprovalStep } from "@autumn/shared";
import {
	childSessionIdsFromToolArgs,
	siblingRequestIdsFromToolArgs,
	type WithheldWrite,
	withheldWritesFromToolArgs,
} from "../../agentRuntime/eve/parkedInput.js";
import { normalizeToolName } from "../../agentRuntime/tools/toolPolicy.js";
import { isInternalAutumnSlackProvider } from "../../slackAdmin/provider.js";
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

/** Sibling park ids are the grouped steps' request ids — derived, not stored
 * twice. Legacy rows fall back to the marker. */
export const siblingRequestIdsOf = ({
	approval,
	steps,
}: {
	approval: ChatApproval;
	steps?: ReadonlyArray<ChatApprovalStep>;
}): ReadonlyArray<string> => {
	const grouped = (steps ?? [])
		.filter((step) => step.position > 0 && step.request_id)
		.map((step) => step.request_id as string);
	return grouped.length
		? grouped
		: siblingRequestIdsFromToolArgs(approval.tool_args);
};

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

/** Slack cards render every write in a parked batch, so approving the card
 * approves the group; the dashboard shows the primary write alone. Internal
 * Slack threads use the `slack_admin:<client>` provider and the same card. */
export const surfaceRendersGroup = (provider: string) =>
	provider === "slack" || isInternalAutumnSlackProvider({ provider });

const SHEET_LINKABLE_TOOLS = new Set(["attach", "updateSubscription"]);

const UNSEEDABLE_CUSTOMIZE_KEYS = [
	"billing_controls",
	"remove_licenses",
	"update_items",
] as const;

/** Mirrors the server's billing_request_resolution `unrepresentable` set:
 * keys with no V0-dialect slot cannot be shown or edit-preserved in a sheet. */
const sheetSeedableCustomize = (customize: unknown) => {
	if (!customize) return true;
	if (typeof customize !== "object") return false;
	return UNSEEDABLE_CUSTOMIZE_KEYS.every(
		(key) => (customize as Record<string, unknown>)[key] === undefined,
	);
};

/** Single-step attach/updateSubscription cards from real customer workspaces
 * can deep-link to the dashboard sheet. Excluded: internal admin threads (they
 * hop orgs, the link would 403) and requests the sheet cannot faithfully
 * represent (see sheetSeedableCustomize). */
export const dashboardLinkableApproval = ({
	approval,
	groupedStepCount,
}: {
	approval: Pick<ChatApproval, "provider" | "tool_args" | "tool_name">;
	groupedStepCount: number;
}) => {
	const request = approval.tool_args?.request;
	const customize =
		request && typeof request === "object"
			? (request as Record<string, unknown>).customize
			: undefined;
	return (
		groupedStepCount === 0 &&
		sheetSeedableCustomize(customize) &&
		SHEET_LINKABLE_TOOLS.has(normalizeToolName(approval.tool_name)) &&
		!isInternalAutumnSlackProvider({ provider: approval.provider ?? "" })
	);
};
