import { writeToPreviewTool } from "../../internal/approvals/utils/toolRegistry.js";
import {
	isSameToolRequest,
	toolRequestFromArgs,
} from "../../internal/approvals/utils/toolRequest.js";
import { parsePreviewPayload } from "../../ui/previewContent.js";

/** A preview payload kept with the (normalized) preview tool that produced it
 * and the request it was previewing. */
export type CapturedPreview = {
	preview: unknown;
	previewTool: string;
	request?: Record<string, unknown>;
};

/**
 * The turn's captured preview, but only for the write it actually previewed —
 * eve can preview one write and then park on a different one. Left unset
 * otherwise, so the approval surface backfills the preview that belongs.
 */
export const previewForParkedWrite = ({
	captured,
	input,
	toolName,
}: {
	captured?: CapturedPreview;
	input?: Record<string, unknown>;
	toolName: string;
}) => {
	if (!captured) return undefined;
	if (writeToPreviewTool(toolName) !== captured.previewTool) return undefined;
	// Two writes can share a preview tool (updatePlan/updateCatalog), and eve
	// need not report either payload — an unproven match must not reach the card.
	const parkedRequest = toolRequestFromArgs(input);
	if (!(captured.request && parkedRequest)) return undefined;
	if (!isSameToolRequest(captured.request, parkedRequest)) return undefined;
	return parsePreviewPayload(captured.preview);
};
