import type { ApiField, ApiRoute } from "../../generated/apiRoutes";
import { API_ROUTES, API_VERSION } from "../../generated/apiRoutes";
import { AutumnApiError } from "../../generated/client";

export type ApiCallOptions = {
	route: ApiRoute;
	baseUrl: string;
	secretKey: string;
	/** `--body`: a JSON document, or `-` for stdin. */
	body?: string;
	/** `key=value` arguments, keyed by wire name; a JSON-typed field arrives as text. */
	fields?: Record<string, string>;
	/** `-H "name: value"`, repeatable; a stated header wins over the default. */
	headers?: string[];
	readStdin?: () => Promise<string>;
	fetch?: typeof globalThis.fetch;
};

export const findApiRoute = ({
	group,
	method,
}: {
	group: string;
	method: string;
}): ApiRoute | undefined =>
	API_ROUTES.find((route) => route.group === group && route.method === method);

export const apiGroups = (): string[] => [
	...new Set(API_ROUTES.map((route) => route.group)),
];

/**
 * `customer_id=cus_1`: fields ride as positional pairs rather than flags, so a
 * field named `version` or `config` can never collide with the CLI's own.
 */
export const parseFieldArgs = ({
	args,
}: {
	args: string[];
}): Record<string, string> => {
	const fields: Record<string, string> = {};
	for (const arg of args) {
		const at = arg.indexOf("=");
		if (at <= 0)
			throw new Error(
				`Expected key=value, got ${JSON.stringify(arg)}. Pass the whole body with --body instead.`,
			);
		fields[arg.slice(0, at)] = arg.slice(at + 1);
	}
	return fields;
};

const parseJson = ({ text, what }: { text: string; what: string }): unknown => {
	try {
		return JSON.parse(text);
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		throw new Error(`${what} is not valid JSON: ${detail}`);
	}
};

const coerce = ({
	field,
	value,
}: {
	field: ApiField;
	value: string;
}): unknown => {
	switch (field.type) {
		case "boolean": {
			if (value === "true") return true;
			if (value === "false") return false;
			throw new Error(`${field.name} takes true or false.`);
		}
		case "number": {
			const parsed = Number(value);
			if (value === "" || !Number.isFinite(parsed))
				throw new Error(`${field.name} takes a number.`);
			return parsed;
		}
		case "string":
			return value;
		case "json":
			return parseJson({ text: value, what: field.name });
	}
};

/**
 * `--body` is the whole document; field flags layer on top of it, so a saved
 * JSON body can still be overridden for one call.
 */
export const buildApiBody = async ({
	route,
	body,
	fields = {},
	readStdin,
}: {
	route: ApiRoute;
	body?: string;
	fields?: Record<string, string>;
	readStdin?: () => Promise<string>;
}): Promise<unknown> => {
	const stated = Object.entries(fields);
	let document: unknown = route.body === "array" ? undefined : {};
	if (body !== undefined) {
		const text = body === "-" ? await (readStdin ?? defaultReadStdin)() : body;
		document = parseJson({ text, what: "--body" });
	}
	if (stated.length === 0) return document;
	if (route.body === "array")
		throw new Error(
			`${route.path} takes an array body: pass it with --body, not key=value.`,
		);
	if (
		typeof document !== "object" ||
		document === null ||
		Array.isArray(document)
	)
		throw new Error(
			"--body must be a JSON object when key=value pairs are given.",
		);
	const byName = new Map(route.fields.map((field) => [field.name, field]));
	const merged: Record<string, unknown> = { ...document };
	for (const [name, value] of stated) {
		const field = byName.get(name);
		if (field === undefined)
			throw new Error(
				`${route.path} has no field ${name}. Fields: ${route.fields.map((known) => known.name).join(", ")}.`,
			);
		merged[name] = coerce({ field, value });
	}
	return merged;
};

const defaultReadStdin = async (): Promise<string> => {
	const chunks: Buffer[] = [];
	for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
	return Buffer.concat(chunks).toString("utf8");
};

/** `-H "x-api-version: 2.3.0"` → `["x-api-version", "2.3.0"]`; the name is lowercased like fetch does. */
export const parseHeaderArgs = ({
	headers,
}: {
	headers: string[];
}): Record<string, string> => {
	const parsed: Record<string, string> = {};
	for (const header of headers) {
		const at = header.indexOf(":");
		const name = at > 0 ? header.slice(0, at).trim().toLowerCase() : "";
		if (name === "")
			throw new Error(
				`Expected -H "name: value", got ${JSON.stringify(header)}.`,
			);
		parsed[name] = header.slice(at + 1).trim();
	}
	return parsed;
};

export type ApiRequest = {
	url: string;
	headers: Record<string, string>;
	body: string;
};

export const buildApiRequest = async ({
	route,
	baseUrl,
	secretKey,
	body,
	fields,
	headers = [],
	readStdin,
}: Omit<ApiCallOptions, "fetch">): Promise<ApiRequest> => ({
	url: `${baseUrl}${route.path}`,
	headers: {
		authorization: `Bearer ${secretKey}`,
		"content-type": "application/json",
		"x-api-version": API_VERSION,
		...parseHeaderArgs({ headers }),
	},
	body: JSON.stringify(
		(await buildApiBody({ route, body, fields, readStdin })) ?? {},
	),
});

const shellQuote = (text: string): string => `'${text.replace(/'/g, "'\\''")}'`;

/** The same request as a curl line, for pasting into a doc or a support
 * thread. The key is shown as the literal name of its env var, on purpose:
 * nothing in the output is a secret, and the reader fills it in. */
export const renderCurl = ({
	request,
	secretKey,
	secretKeyName,
}: {
	request: ApiRequest;
	secretKey: string;
	/** The env var the key came from, printed in the key's place. */
	secretKeyName: string;
}): string =>
	[
		`curl -X POST ${shellQuote(request.url)}`,
		...Object.entries(request.headers).map(([name, value]) => {
			// An authorization the caller overrode with -H is theirs to show.
			const shown =
				name === "authorization" && value === `Bearer ${secretKey}`
					? `Bearer $${secretKeyName}`
					: value;
			return `  -H ${shellQuote(`${name}: ${shown}`)}`;
		}),
		`  -d ${shellQuote(request.body)}`,
	].join(" \\\n");

const tryParseJson = ({ text }: { text: string }): unknown => {
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
};

/** A non-2xx reply, whole: the command prints it rather than a one-line summary. */
export class ApiResponseError extends AutumnApiError {
	readonly statusText: string;

	constructor({
		status,
		statusText,
		body,
		path,
	}: {
		status: number;
		statusText: string;
		body: unknown;
		path: string;
	}) {
		super({ status, body, path });
		this.name = "ApiResponseError";
		this.statusText = statusText;
	}
}

/** `HTTP 404 Not Found`, and the body as the server sent it, pretty-printed when it is JSON. */
export const renderApiResponseError = ({
	error,
}: {
	error: ApiResponseError;
}): { statusLine: string; body: string } => ({
	statusLine: `HTTP ${error.status} ${error.statusText}`,
	body:
		typeof error.body === "string"
			? error.body
			: JSON.stringify(error.body, null, 2),
});

/** One POST, the way the generated client does it, plus the version header the spec pins. */
export const callApi = async ({
	fetch = globalThis.fetch,
	...options
}: ApiCallOptions): Promise<unknown> => {
	const request = await buildApiRequest(options);
	const response = await fetch(request.url, {
		method: "POST",
		headers: request.headers,
		body: request.body,
	});
	const text = await response.text();
	// A proxy's HTML error page is not JSON; the status and route still matter.
	const parsed: unknown = text ? tryParseJson({ text }) : null;
	if (!response.ok)
		throw new ApiResponseError({
			status: response.status,
			statusText: response.statusText,
			body: parsed,
			path: options.route.path,
		});
	return parsed;
};
