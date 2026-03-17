import { BACKEND_URL, LOCAL_BACKEND_URL } from "../../constants.js";
import { isLocal } from "../env/cliContext.js";

/**
 * Get the current backend URL based on CLI flags
 */
function getBackendUrl(): string {
	return isLocal() ? LOCAL_BACKEND_URL : BACKEND_URL;
}

/**
 * Low-level API client for making authenticated requests
 */

export interface RequestOptions {
	method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
	path: string;
	secretKey: string;
	body?: unknown;
	queryParams?: Record<string, string | number | boolean>;
	/** Additional headers to include in the request */
	headers?: Record<string, string>;
}

export interface ApiError extends Error {
	status?: number;
	response?: unknown;
	url?: string;
	method?: string;
}

/**
 * Format an error for display, including full context for debugging
 */
export function formatError(err: unknown): string {
	if (!(err instanceof Error)) {
		return String(err);
	}

	const apiError = err as ApiError;
	const lines: string[] = [];

	// Start with the basic error message
	lines.push(err.message);

	// Add request context if available
	if (apiError.method && apiError.url) {
		lines.push(`  Request: ${apiError.method} ${apiError.url}`);
	}

	// Add status if available
	if (apiError.status) {
		lines.push(`  Status: ${apiError.status}`);
	}

	// Add response details if available
	if (apiError.response) {
		const resp = apiError.response as Record<string, unknown>;
		lines.push(
			`  Response: ${JSON.stringify(resp, null, 2).split("\n").join("\n  ")}`,
		);
	}

	return lines.join("\n");
}

/**
 * Make an authenticated API request
 */
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

	// Build URL with query params (respects --local flag)
	const url = new URL(path, getBackendUrl());
	if (queryParams) {
		for (const [key, value] of Object.entries(queryParams)) {
			url.searchParams.set(key, String(value));
		}
	}

	// Build request headers
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

	// Make request
	try {
		// Debug: log the request URL (can be removed later)
		if (process.env['ATMN_DEBUG']) {
			console.log(`[DEBUG] ${method} ${url.toString()}`);
		}
		const response = await fetch(url.toString(), requestInit);

		// Parse response
		let data: unknown;
		const contentType = response.headers.get("content-type");
		if (contentType?.includes("application/json")) {
			data = await response.json();
		} else {
			data = await response.text();
		}

		// Check for errors
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
			throw error; // Re-throw API errors
		}
		// Wrap network errors
		const apiError = new Error(
			`Network request failed: ${error instanceof Error ? error.message : String(error)}`,
		) as ApiError;
		throw apiError;
	}
}
