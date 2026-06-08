import { prefixOAuthToken } from "@autumn/auth";
import { RecaseError } from "@autumn/shared";
import type { Context } from "hono";
import { db } from "@/db/initDrizzle.js";
import { auth } from "@/utils/auth.js";
import { returnsOAuthAccessTokenForClientId } from "../actions/registerMcpOAuthClient.js";
import {
	getExternalOAuthApiKeyForToken,
	getOAuthAccessTokenRecord,
	scopesFromOAuthScopeString,
} from "./oauthAccessTokenApiKey.js";

const getString = (value: unknown) =>
	typeof value === "string" && value.length > 0 ? value : null;

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const getTokenPayload = (body: Record<string, unknown>) => {
	const response = body.response;
	if (isRecord(response)) return response;
	return body;
};

const rewriteTokenBody = ({
	apiKey,
	body,
	scopes,
}: {
	apiKey: string;
	body: Record<string, unknown>;
	scopes: string[];
}) => {
	const response = body.response;
	if (isRecord(response)) {
		return {
			...body,
			response: {
				...response,
				access_token: apiKey,
				scope: scopes.join(" "),
			},
		};
	}

	return {
		...body,
		access_token: apiKey,
		scope: scopes.join(" "),
	};
};

const rewriteOAuthAccessTokenBody = ({
	accessToken,
	body,
}: {
	accessToken: string;
	body: Record<string, unknown>;
}) => {
	const response = body.response;
	if (isRecord(response)) {
		return {
			...body,
			response: {
				...response,
				access_token: accessToken,
			},
		};
	}

	return {
		...body,
		access_token: accessToken,
	};
};

const tokenResponseHeaders = (response?: Response) => {
	const headers = new Headers(response?.headers);
	headers.set("Content-Type", "application/json");
	headers.set("Cache-Control", "no-store");
	headers.set("Pragma", "no-cache");
	headers.delete("Content-Length");
	return headers;
};

const jsonTokenResponse = ({
	body,
	response,
	status,
}: {
	body: unknown;
	response?: Response;
	status: number;
}) =>
	new Response(JSON.stringify(body), {
		status,
		headers: tokenResponseHeaders(response),
	});

const getResourceFromTokenRequest = async (request: Request) => {
	const contentType = request.headers.get("content-type") ?? "";
	const rawBody = await request.text();
	if (!rawBody) return null;

	if (contentType.includes("application/json")) {
		try {
			const body = JSON.parse(rawBody) as Record<string, unknown>;
			const resource = body.resource;
			if (Array.isArray(resource)) return getString(resource[0]);
			return getString(resource);
		} catch {
			return null;
		}
	}

	const params = new URLSearchParams(rawBody);
	return params.getAll("resource")[0] ?? null;
};

export const handleOAuthTokenWithApiKey = async (c: Context) => {
	const resource = await getResourceFromTokenRequest(c.req.raw.clone());
	const response = await auth.handler(c.req.raw);
	if (!response.ok) return response;

	let body: Record<string, unknown>;
	try {
		body = (await response.clone().json()) as Record<string, unknown>;
	} catch {
		return response;
	}

	const tokenPayload = getTokenPayload(body);
	const accessToken = getString(tokenPayload.access_token);
	if (!accessToken) return response;

	const requestedScopes = scopesFromOAuthScopeString(tokenPayload.scope);
	let apiKeyResult: Awaited<ReturnType<typeof getExternalOAuthApiKeyForToken>>;
	try {
		const tokenRecord = await getOAuthAccessTokenRecord({
			db,
			accessToken,
			resource,
			requestedScopes,
		});
		if (
			returnsOAuthAccessTokenForClientId({ clientId: tokenRecord.clientId })
		) {
			return jsonTokenResponse({
				body: rewriteOAuthAccessTokenBody({
					accessToken: prefixOAuthToken({ token: accessToken }),
					body,
				}),
				response,
				status: response.status,
			});
		}
		apiKeyResult = await getExternalOAuthApiKeyForToken({
			db,
			tokenRecord,
			requestedScopes,
		});
	} catch (error) {
		if (error instanceof RecaseError) {
			return jsonTokenResponse({
				body: {
					error: "invalid_grant",
					error_description: error.message,
				},
				status: error.statusCode,
			});
		}
		throw error;
	}
	if (!apiKeyResult) return response;

	return jsonTokenResponse({
		body: rewriteTokenBody({
			apiKey: apiKeyResult.apiKey,
			body,
			scopes: apiKeyResult.scopes,
		}),
		response,
		status: response.status,
	});
};
