const SENSITIVE_REQUEST_BODY_KEYS = new Set(["connectionString"]);
const REDACTED_REQUEST_BODY_VALUE = "[REDACTED]";

export const redactRequestBody = ({ body }: { body: unknown }): unknown => {
	if (!body || typeof body !== "object") return body;

	if (Array.isArray(body)) {
		return body.map((item) => redactRequestBody({ body: item }));
	}

	return Object.fromEntries(
		Object.entries(body).map(([key, value]) => [
			key,
			SENSITIVE_REQUEST_BODY_KEYS.has(key)
				? REDACTED_REQUEST_BODY_VALUE
				: redactRequestBody({ body: value }),
		]),
	);
};
