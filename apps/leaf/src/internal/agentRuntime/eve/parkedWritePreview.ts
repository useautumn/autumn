import { parsePreviewPayload } from "@autumn/render";
import { writeToPreviewTool } from "../../approvals/utils/toolRegistry.js";
import {
	isSameToolRequest,
	toolRequestFromArgs,
} from "../../approvals/utils/toolRequest.js";

export type CapturedPreview = {
	preview: unknown;
	previewTool: string;
	request?: Record<string, unknown>;
};

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
	const parkedRequest = toolRequestFromArgs(input);
	if (!(captured.request && parkedRequest)) return undefined;
	if (!isSameToolRequest(captured.request, parkedRequest)) return undefined;
	return parsePreviewPayload(captured.preview);
};
