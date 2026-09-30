const MAX_RESPONSE_BYTES = 200_000;
const TRUNCATION_NOTE = `Response exceeded ${MAX_RESPONSE_BYTES} bytes and was truncated; narrow the request with params (limit, filters) or fewer pages.`;

type StripeList = {
	object: "list" | "search_result";
	data: unknown[];
	has_more: boolean;
};

const LIST_OBJECTS = new Set(["list", "search_result"]);

const byteLength = (value: unknown) =>
	Buffer.byteLength(JSON.stringify(value) ?? "");

const isStripeList = (body: unknown): body is StripeList =>
	typeof body === "object" &&
	body !== null &&
	LIST_OBJECTS.has(String((body as { object?: unknown }).object)) &&
	Array.isArray((body as { data?: unknown }).data);

const truncateList = ({ list }: { list: StripeList }) => {
	const budget = MAX_RESPONSE_BYTES - byteLength({ ...list, data: [] }) - 500;
	const kept: unknown[] = [];
	let used = 0;
	for (const item of list.data) {
		used += byteLength(item) + 1;
		if (used > budget) break;
		kept.push(item);
	}
	return {
		...list,
		data: kept,
		has_more: true,
		truncated: true,
		truncation_note: TRUNCATION_NOTE,
	};
};

export const capStripeResponse = ({ body }: { body: unknown }): unknown => {
	if (byteLength(body) <= MAX_RESPONSE_BYTES) return body;
	if (isStripeList(body)) return truncateList({ list: body });

	return {
		truncated: true,
		truncation_note: TRUNCATION_NOTE,
		// Half the budget leaves room for escaping when the string is re-serialized.
		partial_json: JSON.stringify(body).slice(0, MAX_RESPONSE_BYTES / 2),
	};
};
