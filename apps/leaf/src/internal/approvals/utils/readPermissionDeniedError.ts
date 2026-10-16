import type { PermissionDenial } from "./permissionDenialText.js";

type DeniedError = {
	code: "permission_denied";
	message: string;
	details: Omit<PermissionDenial, "message">;
};

const isDeniedError = (value: unknown): value is DeniedError =>
	typeof value === "object" &&
	value !== null &&
	(value as { code?: unknown }).code === "permission_denied" &&
	typeof (value as { details?: unknown }).details === "object";

// The error JSON, alone or after an "Autumn API request failed (403): " prefix.
const parseErrorJson = (text: string): unknown => {
	const start = text.indexOf("{");
	if (start < 0) return undefined;
	try {
		return JSON.parse(text.slice(start));
	} catch {
		return undefined;
	}
};

/** A write's 403 `permission_denied`, from the error itself or the MCP result's text. */
export const readPermissionDeniedError = (
	value: unknown,
): PermissionDenial | undefined => {
	const content = (value as { content?: unknown } | null)?.content;
	const texts = Array.isArray(content)
		? content.flatMap((entry) =>
				typeof entry?.text === "string" ? [entry.text] : [],
			)
		: [];
	const message = (value as { message?: unknown } | null)?.message;
	const candidates = [
		value,
		...texts.map(parseErrorJson),
		...(typeof message === "string" ? [parseErrorJson(message)] : []),
	];
	const denied = candidates.find(isDeniedError);
	return denied && { message: denied.message, ...denied.details };
};
