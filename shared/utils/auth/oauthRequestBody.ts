import { z } from "zod";

export type OAuthRequestFields = Record<string, unknown>;

export type ParsedOAuthRequest = {
	fields: OAuthRequestFields;
	isJson: boolean;
	rawBody: string;
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
	// Dynamic client registration read its body with `request.json()`, which
	// ignores the content type, so clients that omit or mislabel it must keep
	// registering. A body opening with `{` is never a valid form payload.
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
	const empty = { fields: {}, isJson, rawBody };
	if (!rawBody) return empty;

	if (isJson) {
		try {
			return { ...empty, fields: jsonFieldsSchema.parse(JSON.parse(rawBody)) };
		} catch {
			return empty;
		}
	}

	return {
		...empty,
		fields: Object.fromEntries(new URLSearchParams(rawBody).entries()),
	};
};

/**
 * Re-encodes `fields` in the request's original content type, with keys in a
 * stable order: the refresh replay key hashes this body, so a client retrying
 * the same refresh has to produce the same bytes.
 */
export const rebuildOAuthRequest = ({
	fields,
	isJson,
	request,
}: {
	fields: OAuthRequestFields;
	isJson: boolean;
	request: Request;
}) => {
	const sortedEntries = Object.keys(fields)
		.sort()
		.map((key) => [key, fields[key]] as const);

	if (isJson) {
		return new Request(request, {
			body: JSON.stringify(Object.fromEntries(sortedEntries)),
		});
	}

	const params = new URLSearchParams();
	for (const [key, value] of sortedEntries) {
		if (typeof value === "string") params.set(key, value);
	}

	return new Request(request, { body: params });
};
