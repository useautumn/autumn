import { prefixOAuthToken } from "@autumn/auth";
import {
	getOAuthResourceScopes,
	getResourceFromOAuthTokenRequest,
	returnsOAuthAccessTokenForClientId,
} from "@autumn/auth/oauth";
import { ErrCode, RecaseError } from "@autumn/shared";
import type { Context } from "hono";
import { db } from "@/db/initDrizzle.js";
import { auth } from "@/utils/auth.js";
import { oauthAccessTokenRepo, oauthRefreshTokenRepo } from "../repos/index.js";
import { isMcpOAuthClient } from "./mcpOAuthScopes.js";
import {
	getExternalOAuthApiKeyForToken,
	getOAuthAccessTokenRecord,
	scopesFromOAuthScopeString,
} from "./oauthAccessTokenApiKey.js";
import { getOAuthConsentScopeGrant } from "./oauthConsentScopes.js";

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
	scopes,
}: {
	accessToken: string;
	body: Record<string, unknown>;
	scopes: string[];
}) => {
	const response = body.response;
	if (isRecord(response)) {
		return {
			...body,
			response: {
				...response,
				access_token: accessToken,
				scope: scopes.join(" "),
			},
		};
	}

	return {
		...body,
		access_token: accessToken,
		scope: scopes.join(" "),
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

export const handleOAuthTokenWithApiKey = async (c: Context) => {
	const resource = await getResourceFromOAuthTokenRequest(c.req.raw.clone());
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

	const parsedRequestedScopes = scopesFromOAuthScopeString(tokenPayload.scope);
	const requestedScopes = parsedRequestedScopes
		? getOAuthResourceScopes(parsedRequestedScopes)
		: null;
	let apiKeyResult: Awaited<ReturnType<typeof getExternalOAuthApiKeyForToken>>;
	try {
		const tokenRecord = await getOAuthAccessTokenRecord({
			db,
			accessToken,
			resource,
			requestedScopes,
		});
		if (tokenRecord.scopes.length === 0) {
			throw new RecaseError({
				message: "OAuth token has no scopes",
				code: ErrCode.InvalidRequest,
				statusCode: 401,
			});
		}
		const issuedScopes = await getOAuthConsentScopeGrant({
			db,
			organizationId: tokenRecord.referenceId,
			requestedScopes: parsedRequestedScopes ?? tokenRecord.scopes,
			userId: tokenRecord.userId,
		});
		tokenRecord.scopes = getOAuthResourceScopes(issuedScopes);
		if (tokenRecord.id) {
			await oauthAccessTokenRepo.updateScopes({
				db,
				id: tokenRecord.id,
				scopes: tokenRecord.scopes,
			});
		}
		if (tokenRecord.refreshId) {
			await oauthRefreshTokenRepo.updateScopes({
				db,
				id: tokenRecord.refreshId,
				scopes: issuedScopes,
			});
		}
		const isMcpClient = await isMcpOAuthClient({
			clientId: tokenRecord.clientId,
			db,
			resource: resource ?? undefined,
		});
		if (
			isMcpClient ||
			returnsOAuthAccessTokenForClientId({ clientId: tokenRecord.clientId })
		) {
			return jsonTokenResponse({
				body: rewriteOAuthAccessTokenBody({
					accessToken: prefixOAuthToken({ token: accessToken }),
					body,
					scopes: tokenRecord.scopes,
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
