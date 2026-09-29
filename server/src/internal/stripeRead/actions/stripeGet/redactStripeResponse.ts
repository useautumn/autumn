const REDACTED_KEYS = new Set(["client_secret"]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const shouldRedact = ({
	record,
	key,
}: {
	record: Record<string, unknown>;
	key: string;
}) =>
	REDACTED_KEYS.has(key) ||
	(key === "url" && record.object === "checkout.session");

export const redactStripeResponse = ({ body }: { body: unknown }): unknown => {
	if (Array.isArray(body)) {
		return body.map((item) => redactStripeResponse({ body: item }));
	}
	if (!isRecord(body)) return body;

	return Object.fromEntries(
		Object.entries(body)
			.filter(([key]) => !shouldRedact({ record: body, key }))
			.map(([key, value]) => [key, redactStripeResponse({ body: value })]),
	);
};
