const MAX_ERROR_TEXT_LENGTH = 500;

const compact = (value: unknown) =>
	(typeof value === "string" ? value : JSON.stringify(value)).slice(
		0,
		MAX_ERROR_TEXT_LENGTH,
	);

const contentText = (content: unknown) => {
	if (!Array.isArray(content)) return;
	const text = (content[0] as { text?: unknown } | undefined)?.text;
	return typeof text === "string" ? text : undefined;
};

const parsedContentRecord = (
	content: unknown,
): Record<string, unknown> | undefined => {
	const text = contentText(content);
	if (!text) return;
	try {
		const parsed = JSON.parse(text) as unknown;
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			return parsed as Record<string, unknown>;
		}
	} catch {
		return;
	}
	return;
};

/** MCP tool failures come back as FULFILLED results, not rejections: thrown
 * server errors as `isError` envelopes, guardResponseSize refusals as
 * `{error: true, message}` payloads. Skipping this check treats both as success. */
export const autumnMcpErrorText = (value: unknown): string | undefined => {
	if (!value || typeof value !== "object" || Array.isArray(value)) return;
	const record = value as Record<string, unknown>;
	if (record.isError === true) {
		return compact(contentText(record.content) ?? record.content ?? record);
	}
	const payload = parsedContentRecord(record.content);
	if (payload?.error === true && typeof payload.message === "string") {
		return compact(payload.message);
	}
	return;
};

/** Raw payload variant: some callers see unwrapped payloads where a failure
 * is a bare `{error}` / `{message, code|domain}` / `{cause}` record. */
export const rawErrorShapeText = (value: unknown): string | undefined => {
	if (!value || typeof value !== "object" || Array.isArray(value)) return;
	const record = value as Record<string, unknown>;
	if (record.error) return compact(record.error);
	if (
		typeof record.message === "string" &&
		("code" in record || "domain" in record || "cause" in record)
	) {
		return compact(record.message);
	}
	if ("cause" in record) return compact(record.cause ?? record);
	return;
};
