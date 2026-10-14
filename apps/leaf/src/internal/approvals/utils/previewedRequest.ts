import { withoutApprovalDescription } from "./approvalDescription.js";
import { isSameToolRequest, toolRequestFromArgs } from "./toolRequest.js";

export type PreviewedRequest = Readonly<{
	previewTool: string;
	request: Record<string, unknown>;
}>;

const MAX_DRIFT_KEYS = 6;
const MAX_VALUE_CHARS = 400;

export const comparableToolRequest = (
	args?: Record<string, unknown>,
): Record<string, unknown> | undefined =>
	args ? toolRequestFromArgs(withoutApprovalDescription(args)) : undefined;

export const findPreviewedRequest = ({
	previewTool,
	previewed,
	request,
}: {
	previewTool: string;
	previewed: ReadonlyArray<PreviewedRequest>;
	request: Record<string, unknown>;
}): PreviewedRequest | undefined =>
	previewed.find(
		(entry) =>
			entry.previewTool === previewTool &&
			isSameToolRequest(entry.request, request),
	);

const compact = (value: unknown) => {
	const json = JSON.stringify(value);
	return json.length > MAX_VALUE_CHARS
		? `${json.slice(0, MAX_VALUE_CHARS - 1)}…`
		: json;
};

export const describeRequestDrift = ({
	previewed,
	request,
}: {
	previewed: Record<string, unknown>;
	request: Record<string, unknown>;
}): string => {
	const keys = [
		...new Set([...Object.keys(previewed), ...Object.keys(request)]),
	]
		.sort()
		.filter(
			(key) => !isSameToolRequest({ v: previewed[key] }, { v: request[key] }),
		);
	const lines = keys.slice(0, MAX_DRIFT_KEYS).map((key) => {
		if (!(key in request)) {
			return `\`${key}\` was previewed as ${compact(previewed[key])} but is missing from the write`;
		}
		if (!(key in previewed)) {
			return `\`${key}\` is ${compact(request[key])} on the write but was not previewed`;
		}
		return `\`${key}\` was previewed as ${compact(previewed[key])} but the write has ${compact(request[key])}`;
	});
	if (keys.length > MAX_DRIFT_KEYS) {
		lines.push(`…and ${keys.length - MAX_DRIFT_KEYS} more field(s)`);
	}
	return lines.join("; ");
};

export const unpreviewedWriteReason = ({
	previewTool,
	previewed,
	request,
	toolName,
}: {
	previewTool: string;
	previewed: ReadonlyArray<PreviewedRequest>;
	request: Record<string, unknown> | undefined;
	toolName: string;
}): string | undefined => {
	if (!request) {
		return `\`${toolName}\` was called without a request body.`;
	}
	const candidates = previewed.filter(
		(entry) => entry.previewTool === previewTool,
	);
	if (findPreviewedRequest({ previewTool, previewed: candidates, request })) {
		return undefined;
	}
	const latest = candidates.at(-1);
	if (!latest) {
		return `\`${toolName}\` was called with a request that was never run through \`${previewTool}\` in this session.`;
	}
	return `\`${toolName}\` was called with a different request from the one \`${previewTool}\` last ran: ${describeRequestDrift({ previewed: latest.request, request })}.`;
};
