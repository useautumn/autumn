import { AutumnClientError } from "../AutumnClientError";

export type HttpClientConfig = {
	backendUrl?: string;
	pathPrefix: string;
	includeCredentials?: boolean;
	headers?: Record<string, string>;
};

type ErrorBody = {
	message: string;
	code: string;
	statusCode: number;
	details?: unknown;
};

const isErrorBody = (body: unknown): body is ErrorBody => {
	return (
		!!body &&
		typeof body === "object" &&
		"message" in body &&
		"code" in body &&
		"statusCode" in body
	);
};

export const createHttpClient = (config: HttpClientConfig) => {
	const {
		backendUrl,
		pathPrefix,
		includeCredentials,
		headers: customHeaders,
	} = config;
	const baseUrl = backendUrl ? `${backendUrl}${pathPrefix}` : pathPrefix;

	const request = async <T>({
		route,
		body,
		method = "POST",
	}: {
		route: string;
		body?: unknown;
		method?: "GET" | "POST";
	}): Promise<T> => {
		const url = `${baseUrl}/${route}`;

		const headers: Record<string, string> = {
			"Content-Type": "application/json",
			...customHeaders,
		};

		try {
			const response = await fetch(url, {
				method,
				headers,
				...(includeCredentials && { credentials: "include" as const }),
				...(body !== undefined && { body: JSON.stringify(body) }),
			});

			const statusCode = response.status;

			if (statusCode === 204) {
				return null as T;
			}

			const result = await response.json();

			if (!response.ok) {
				const error = isErrorBody(result)
					? new AutumnClientError(result)
					: new AutumnClientError({
							message: result?.message || "Request failed",
							code: result?.code || "request_failed",
							statusCode,
						});

				console.error(`[Autumn] ${error.message}`);

				throw error;
			}

			return result as T;
		} catch (error) {
			if (error instanceof AutumnClientError) {
				throw error;
			}

			const message = error instanceof Error ? error.message : "Network error";
			const autumnError = new AutumnClientError({
				message,
				code: "network_error",
				statusCode: 0,
			});

			console.error(`[Autumn] ${autumnError.code}: ${autumnError.message}`);
			throw autumnError;
		}
	};

	return { request };
};
