import { writeToPreviewTool } from "../../internal/approvals/utils/toolRegistry.js";
import { parsePreviewPayload } from "../../ui/previewContent.js";

/** A preview payload kept with the (normalized) preview tool that produced it. */
export type CapturedPreview = { preview: unknown; previewTool: string };

/**
 * The turn's captured preview, but only for the write it actually previewed —
 * eve can preview one write and then park on a different one. Left unset
 * otherwise, so the approval surface backfills the preview that belongs.
 */
export const previewForParkedWrite = ({
	captured,
	toolName,
}: {
	captured?: CapturedPreview;
	toolName: string;
}) => {
	if (!captured) return undefined;
	if (writeToPreviewTool(toolName) !== captured.previewTool) return undefined;
	return parsePreviewPayload(captured.preview);
};
