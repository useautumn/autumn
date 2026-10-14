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

const MAX_PREVIEWS_PER_SESSION = 20;

const REJECTION_GUIDANCE =
	"Nothing was recorded and the user sees no card. " +
	"Call the preview tool with the exact final request first, then call the write with that identical request " +
	"(the `approval_description` beside the request is the only allowed difference). " +
	"If you changed your mind after previewing, preview the new request before writing it.";

export const createPreviewLedger = (
	previewed: StateHandle<ReadonlyArray<PreviewedRequest>>,
) => ({
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

export const previewLedger = createPreviewLedger(
	defineState<ReadonlyArray<PreviewedRequest>>(
		"leaf.previewed-requests",
		() => [],
	),
);
