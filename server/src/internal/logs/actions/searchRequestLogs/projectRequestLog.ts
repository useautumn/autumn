export type RequestLogSource = "api_request" | "stripe_webhook";

export type ApiRequestLogEntry = {
	timestamp: string;
	source: RequestLogSource | null;
	status_code: number;
	request: {
		method: string | null;
		url: string | null;
		path: string | null;
	};
	context: {
		org_id: string | null;
		customer_id: string | null;
		entity_id: string | null;
	};
	stripe: {
		event_id: string | null;
		event_type: string | null;
		object_id: string | null;
	};
	request_body: unknown | null;
	response_body: unknown | null;
};

type AxiomMatch = {
	_time?: string;
	data?: Record<string, unknown>;
};

const pickString = (
	data: Record<string, unknown>,
	keys: string[],
): string | null => {
	for (const key of keys) {
		const value = data[key];
		if (typeof value === "string" && value.length > 0) return value;
	}
	return null;
};

const pickNumber = (
	data: Record<string, unknown>,
	keys: string[],
): number | null => {
	for (const key of keys) {
		const value = data[key];
		if (typeof value === "number" && Number.isFinite(value)) return value;
	}
	return null;
};

const pickUnknown = (
	data: Record<string, unknown>,
	keys: string[],
): unknown | null => {
	for (const key of keys) {
		if (key in data) return data[key] ?? null;
	}
	return null;
};
const extractPath = (url: string | null): string | null => {
	if (!url) return null;
	try {
		return new URL(url).pathname;
	} catch {
		return url.startsWith("/") ? url.split("?")[0] : null;
	}
};

const sourceFromPath = (path: string | null): RequestLogSource | null => {
	if (path?.startsWith("/v1") === true) return "api_request";
	if (
		path?.startsWith("/webhooks/connect/") === true ||
		path?.startsWith("/webhooks/stripe/") === true
	) {
		return "stripe_webhook";
	}
	return null;
};

const pickSource = (
	data: Record<string, unknown>,
	path: string | null,
): RequestLogSource | null => {
	const source = pickString(data, ["source"]);
	if (source === "api_request" || source === "stripe_webhook") return source;
	return sourceFromPath(path);
};

export const projectRequestLog = (match: AxiomMatch): ApiRequestLogEntry => {
	const data = match.data ?? {};
	const url = pickString(data, ["request_url", "req.url", "url"]);
	const projectedPath = pickString(data, ["request_path"]);
	const path = projectedPath ?? extractPath(url);
	const source = pickSource(data, path);

	return {
		timestamp: pickString(data, ["timestamp"]) ?? match._time ?? "",
		source,
		status_code: pickNumber(data, ["status_code", "statusCode"]) ?? 0,
		request: {
			method: pickString(data, ["request_method", "req.method", "method"]),
			url,
			path,
		},
		context: {
			org_id: pickString(data, ["org_id", "context.org_id"]),
			customer_id: pickString(data, [
				"customer_id",
				"context.customer_id",
				"req.customer_id",
			]),
			entity_id: pickString(data, [
				"entity_id",
				"context.entity_id",
				"req.entity_id",
			]),
		},
		stripe: {
			event_id: pickString(data, ["stripe_event_id", "stripe_event.id"]),
			event_type: pickString(data, ["stripe_event_type", "stripe_event.type"]),
			object_id: pickString(data, [
				"stripe_object_id",
				"stripe_event.object_id",
			]),
		},
		request_body: pickUnknown(data, ["request_body", "req.body"]),
		response_body: pickUnknown(data, ["response_body", "res"]),
	};
};

export const isExternalRequestLog = (log: ApiRequestLogEntry): boolean =>
	log.source === "api_request" || log.source === "stripe_webhook";
