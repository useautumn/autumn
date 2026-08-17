import { z } from "zod";

export type OAuthRequestFields = Record<string, unknown>;

export type ParsedOAuthRequest = {
	fields: OAuthRequestFields;
	isJson: boolean;
	rawBody: string;
	searchParams: URLSearchParams | null;
};

export const getOAuthStringField = (value: unknown) =>
	typeof value === "string" && value.length > 0 ? value : null;

const bodyIsJson = ({
	contentType,
	rawBody,
}: {
	contentType: string;
	rawBody: string;
}) => {
	const isJsonContentType =
		contentType.split(";")[0]?.trim().toLowerCase() === "application/json";
	// Some OAuth clients POST JSON without a content type, so sniff the body too.
	const looksLikeJson = rawBody.trimStart().startsWith("{");

	return isJsonContentType || looksLikeJson;
};

/** Anything that is not a JSON object (arrays, numbers, null) carries no fields. */
const jsonFieldsSchema = z.record(z.string(), z.unknown()).catch({});

export const parseOAuthRequestFields = async (
	request: Request,
): Promise<ParsedOAuthRequest> => {
	const contentType = request.headers.get("content-type") ?? "";
	const rawBody = await request.text();
	const isJson = bodyIsJson({ contentType, rawBody });
	const empty = {
		fields: {},
		isJson,
		rawBody,
		searchParams: null,
	};
	if (!rawBody) return empty;

	if (isJson) {
		try {
			return { ...empty, fields: jsonFieldsSchema.parse(JSON.parse(rawBody)) };
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
