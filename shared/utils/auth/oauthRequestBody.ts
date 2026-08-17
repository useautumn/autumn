export type OAuthRequestFields = Record<string, unknown>;

export type ParsedOAuthRequest = {
	contentType: string;
	fields: OAuthRequestFields;
	isJson: boolean;
	rawBody: string;
	searchParams: URLSearchParams | null;
};

export const getOAuthStringField = (value: unknown) =>
	typeof value === "string" && value.length > 0 ? value : null;

// Some OAuth clients POST JSON without a content type, so sniff the body too.
const bodyIsJson = ({
	contentType,
	rawBody,
}: {
	contentType: string;
	rawBody: string;
}) =>
	contentType.split(";")[0]?.trim().toLowerCase() === "application/json" ||
	rawBody.trimStart().startsWith("{");

const asFields = (value: unknown): OAuthRequestFields =>
	value && typeof value === "object" ? (value as OAuthRequestFields) : {};

export const parseOAuthRequestFields = async (
	request: Request,
): Promise<ParsedOAuthRequest> => {
	const contentType = request.headers.get("content-type") ?? "";
	const rawBody = await request.text();
	const isJson = bodyIsJson({ contentType, rawBody });
	const empty = {
		contentType,
		fields: {},
		isJson,
		rawBody,
		searchParams: null,
	};
	if (!rawBody) return empty;

	if (isJson) {
		try {
			return { ...empty, fields: asFields(JSON.parse(rawBody)) };
		} catch {
			return empty;
		}
	}

	const searchParams = new URLSearchParams(rawBody);
	return {
		...empty,
		fields: Object.fromEntries(searchParams.entries()),
		searchParams,
	};
};

/** Re-encodes `fields` in the request's original content type. */
export const rebuildOAuthRequest = ({
	fields,
	isJson,
	request,
	sortKeys = false,
}: {
	fields: OAuthRequestFields;
	isJson: boolean;
	request: Request;
	sortKeys?: boolean;
}) => {
	if (isJson) {
		return new Request(request, {
			body: sortKeys
				? JSON.stringify(fields, Object.keys(fields).sort())
				: JSON.stringify(fields),
		});
	}

	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(fields)) {
		if (typeof value === "string") params.set(key, value);
	}
	if (sortKeys) params.sort();

	return new Request(request, { body: params });
};
