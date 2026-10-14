import { getBackendUrl } from "../env/backendUrl.js";

export interface RequestOptions {
	method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
	path: string;
	secretKey: string;
	body?: unknown;
	queryParams?: Record<string, string | number | boolean>;
	headers?: Record<string, string>;
}

export interface ApiError extends Error {
	status?: number;
	response?: unknown;
	url?: string;
	method?: string;
}

export function formatError(err: unknown): string {
	if (!(err instanceof Error)) {
		return String(err);
	}

	const apiError = err as ApiError;
	const response = apiError.response as { message?: unknown } | undefined;
	const message =
		typeof response?.message === "string" ? response.message : err.message;
	if (!process.env.ATMN_DEBUG) return message;

	const lines = [message];

	if (apiError.method && apiError.url) {
		lines.push(`  Request: ${apiError.method} ${apiError.url}`);
	}

	if (apiError.status) {
		lines.push(`  Status: ${apiError.status}`);
	}

	if (apiError.response) {
		const resp = apiError.response as Record<string, unknown>;
		lines.push(
			`  Response: ${JSON.stringify(resp, null, 2).split("\n").join("\n  ")}`,
		);
	}

	return lines.join("\n");
}

export async function request<T = unknown>(
	options: RequestOptions,
): Promise<T> {
	const {
		method,
		path,
		secretKey,
		body,
		queryParams,
		headers: customHeaders,
	} = options;

	const url = new URL(path, getBackendUrl());
	if (queryParams) {
		for (const [key, value] of Object.entries(queryParams)) {
			url.searchParams.set(key, String(value));
		}
	}

	const headers: Record<string, string> = {
		Authorization: `Bearer ${secretKey}`,
		"Content-Type": "application/json",
		"X-API-Version": "2.1.0",
		...customHeaders,
	};

	const requestInit: RequestInit = {
		method,
		headers,
	};

	if (body && (method === "POST" || method === "PUT" || method === "PATCH")) {
		requestInit.body = JSON.stringify(body);
	}

	try {
		if (process.env.ATMN_DEBUG) {
			console.log(`[DEBUG] ${method} ${url.toString()}`);
		}
		const response = await fetch(url.toString(), requestInit);

		let data: unknown;
		const contentType = response.headers.get("content-type");
		if (contentType?.includes("application/json")) {
			data = await response.json();
		} else {
			data = await response.text();
		}

		if (!response.ok) {
			const error = new Error(
				`API request failed: ${response.status} ${response.statusText}`,
			) as ApiError;
			error.status = response.status;
			error.response = data;
			error.method = method;
			error.url = url.toString();
			throw error;
		}

		return data as T;
	} catch (error) {
		if (error instanceof Error && "status" in error) {
			throw error;
		}
		const apiError = new Error(
			`Network request failed: ${error instanceof Error ? error.message : String(error)}`,
		) as ApiError;
		throw apiError;
	}
}
