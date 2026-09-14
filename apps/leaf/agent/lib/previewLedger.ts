import { defineState, type StateHandle } from "eve/context";
import { isErrorResult } from "../../src/internal/approvals/utils/approvalErrors.js";
import {
	comparableToolRequest,
	type PreviewedRequest,
	unpreviewedWriteReason,
} from "../../src/internal/approvals/utils/previewedRequest.js";
import {
	isPreviewTool,
	writeRequiresPreviewedRequest,
	writeToPreviewTool,
} from "../../src/internal/approvals/utils/toolRegistry.js";

/** Previews kept per session; a session that previews more than this has
 * long moved past its oldest ones. */
const MAX_PREVIEWS_PER_SESSION = 20;

const REJECTION_GUIDANCE =
	"Nothing was recorded and the user sees no card. " +
	"Call the preview tool with the exact final request first, then call the write with that identical request " +
	"(the `approval_description` beside the request is the only allowed difference). " +
	"If you changed your mind after previewing, preview the new request before writing it.";

/** A gated write is only accepted with a request the agent previewed in this
 * session: the walkthrough it writes, the card the user approves and the
 * request that executes are then provably the same one. */
export const createPreviewLedger = (
	previewed: StateHandle<ReadonlyArray<PreviewedRequest>>,
) => ({
	/** Records a preview call the model made, once the server accepted it. */
	recordPreview: ({
		args,
		result,
		toolName,
	}: {
		args: Record<string, unknown>;
		result: unknown;
		toolName: string;
	}) => {
		if (!isPreviewTool(toolName) || isErrorResult(result)) return;
		const request = comparableToolRequest(args);
		if (!request) return;
		previewed.update((entries) =>
			[...entries, { previewTool: toolName, request }].slice(
				-MAX_PREVIEWS_PER_SESSION,
			),
		);
	},
	/** The rejection to hand the model for a write it did not preview
	 * verbatim; undefined when the write is clear to record. */
	rejectionFor: ({
		args,
		toolName,
	}: {
		args: Record<string, unknown>;
		toolName: string;
	}): string | undefined => {
		const previewTool = writeToPreviewTool(toolName);
		if (!(previewTool && writeRequiresPreviewedRequest(toolName))) {
			return undefined;
		}
		const reason = unpreviewedWriteReason({
			previewTool,
			previewed: previewed.get(),
			request: comparableToolRequest(args),
			toolName,
		});
		return reason ? `${reason} ${REJECTION_GUIDANCE}` : undefined;
	},
});

/** Durable per-session state: it survives step boundaries and process
 * restarts, so a preview in one step vouches for the write in the next
 * wherever that step runs. */
export const previewLedger = createPreviewLedger(
	defineState<ReadonlyArray<PreviewedRequest>>(
		"leaf.previewed-requests",
		() => [],
	),
);
