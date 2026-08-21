import type { ChatApproval, ChatApprovalWrite } from "@autumn/shared";
import {
	childSessionIdsFromToolArgs,
	siblingRequestIdsFromToolArgs,
	type WithheldWrite,
	withheldWritesFromToolArgs,
} from "../../agentRuntime/eve/parkedInput.js";
import { normalizeToolName } from "../../agentRuntime/tools/toolPolicy.js";
import { isInternalAutumnSlackProvider } from "../../slackAdmin/provider.js";
import { publicToolArgs } from "../utils/toolRequest.js";

/** Column-first accessors; the `_eve*` marker fallbacks cover pre-column
 * pending rows and can be deleted once no such rows remain. */

export const markerString = (
	toolArgs: Record<string, unknown>,
	key: string,
) => {
	const value = toolArgs[key];
	return typeof value === "string" ? value : undefined;
};

export const approveOptionOf = (approval: ChatApproval): string =>
	approval.approve_option_id ??
	markerString(
		approval.tool_args as Record<string, unknown>,
		"_eveApproveOptionId",
	) ??
	"approve";

export const denyOptionOf = (approval: ChatApproval): string =>
	approval.deny_option_id ??
	markerString(
		approval.tool_args as Record<string, unknown>,
		"_eveDenyOptionId",
	) ??
	"deny";

/** Sibling park ids are the grouped writes' request ids — derived, not stored
 * twice. Legacy rows fall back to the marker. */
export const siblingRequestIdsOf = ({
	approval,
	writes,
}: {
	approval: ChatApproval;
	writes?: ReadonlyArray<ChatApprovalWrite>;
}): ReadonlyArray<string> => {
	const grouped = (writes ?? [])
		.filter((write) => write.position > 0 && write.request_id)
		.map((write) => write.request_id as string);
	return grouped.length
		? grouped
		: siblingRequestIdsFromToolArgs(approval.tool_args);
};

/** Deny option id per grouped sibling request — eve rejects option ids
 * absent from a request, so each sibling's own deny option must be used. */
export const siblingDenyOptionFor = (
	writes: ReadonlyArray<ChatApprovalWrite>,
): ((siblingRequestId: string) => string | undefined) => {
	const denyOptions = new Map(
		writes
			.filter((write) => write.position > 0 && write.request_id)
			.map((write) => [write.request_id as string, write.deny_option_id]),
	);
	return (siblingRequestId) => denyOptions.get(siblingRequestId) ?? undefined;
};

export const childSessionIdsOf = (
	approval: ChatApproval,
): ReadonlyArray<string> =>
	approval.child_session_ids ?? childSessionIdsFromToolArgs(approval.tool_args);

/** The grouped writes beyond the primary, in execution order. Prefers write
 * rows; falls back to the legacy `_eveWithheldWrites` marker. */
export const withheldWritesOf = ({
	approval,
	writes,
}: {
	approval: ChatApproval;
	writes?: ReadonlyArray<ChatApprovalWrite>;
}): ReadonlyArray<WithheldWrite> => {
	const grouped = (writes ?? []).filter((write) => write.position > 0);
	if (grouped.length) {
		return grouped.map((write) => ({
			denyOptionId: write.deny_option_id ?? undefined,
			input: write.tool_args,
			preview: write.preview ?? undefined,
			requestId: write.request_id ?? "",
			toolName: write.tool_name,
		}));
	}
	return withheldWritesFromToolArgs(approval.tool_args);
};

/** Every write on the card — primary first — in execution order. */
export const allWritesOf = ({
	approval,
	writes,
}: {
	approval: ChatApproval;
	writes?: ReadonlyArray<ChatApprovalWrite>;
}): ReadonlyArray<WithheldWrite> => [
	{
		denyOptionId: denyOptionOf(approval),
		input: publicToolArgs(approval.tool_args),
		preview: approval.preview ?? undefined,
		requestId: approval.tool_call_id ?? "",
		toolName: approval.tool_name,
	},
	...withheldWritesOf({ approval, writes }),
];

/** Slack cards render the whole parked batch, so approving approves the
 * group; the dashboard shows the primary write alone. */
export const surfaceRendersGroup = (provider: string) =>
	provider === "slack" || isInternalAutumnSlackProvider({ provider });

const SHEET_LINKABLE_TOOLS = new Set([
	"attach",
	"createSchedule",
	"updateSubscription",
]);

const UNSEEDABLE_CUSTOMIZE_KEYS = [
	"billing_controls",
	"remove_licenses",
	"update_items",
] as const;

/** These keys have no sheet representation — a seed would silently drop
 * them, so their cards stay Slack-only. */
const sheetSeedableCustomize = (customize: unknown) => {
	if (!customize) return true;
	if (typeof customize !== "object") return false;
	return UNSEEDABLE_CUSTOMIZE_KEYS.every(
		(key) => (customize as Record<string, unknown>)[key] === undefined,
	);
};

/** Excludes internal admin threads (they hop orgs — the link would 403) and
 * requests the sheet cannot faithfully represent. */
export const dashboardLinkableApproval = ({
	approval,
	groupedStepCount,
}: {
	approval: {
		provider: string;
		tool_args: ChatApproval["tool_args"];
		tool_name: string;
	};
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
		// The column is notNull, but test fixtures construct partial rows.
		!isInternalAutumnSlackProvider({ provider: approval.provider ?? "" })
	);
};
