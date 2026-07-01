import { prefixOAuthToken } from "@autumn/auth";
import {
	AUTUMN_ADMIN_OAUTH_CLIENT_ID,
	getOAuthResourceScopes,
	getResourceFromOAuthTokenRequest,
	returnsOAuthAccessTokenForClientId,
	UNRESTRICTED_CHAT_OAUTH_CONSENT_KIND,
} from "@autumn/auth/oauth";
import { ErrCode, RecaseError } from "@autumn/shared";
import type { Context } from "hono";
import { db } from "@/db/initDrizzle.js";
import { auth } from "@/utils/auth.js";
import { hashOAuthToken } from "@/utils/oauthUtils.js";
import {
	oauthAccessTokenRepo,
	oauthConsentRepo,
	oauthRefreshTokenRepo,
} from "../repos/index.js";
import { isMcpOAuthClient } from "./mcpOAuthScopes.js";
import {
	getExternalOAuthApiKeyForToken,
	getOAuthAccessTokenRecord,
	scopesFromOAuthScopeString,
} from "./oauthAccessTokenApiKey.js";
import { getOAuthConsentScopeGrant } from "./oauthConsentScopes.js";
import { getRefreshTokenForConsentLookup } from "./tokenRequestFields.js";

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

const getRefreshTokenConsentId = async (request: Request) => {
	const refreshToken = await getRefreshTokenForConsentLookup(request);
	if (!refreshToken) return null;

	const hashedToken = await hashOAuthToken(refreshToken);
	const tokenValues = [...new Set([hashedToken, refreshToken])];
	const tokenRecord = await oauthRefreshTokenRepo.getByTokenValues({
		db,
		tokenValues,
	});
	return tokenRecord?.oauthConsentId ?? null;
};

const getUniqueOAuthConsentId = async ({
	clientId,
	referenceId,
	userId,
}: {
	clientId: string;
	referenceId: string;
	userId: string;
}) => {
	const consents = await oauthConsentRepo.listForClientUserOrg({
		db,
		clientId,
		referenceId,
		userId,
	});
	return consents.length === 1 ? consents[0]!.id : null;
};

const isUnrestrictedChatOAuthConsentMetadata = (metadata: unknown) =>
	!!metadata &&
	typeof metadata === "object" &&
	!Array.isArray(metadata) &&
	(metadata as Record<string, unknown>).kind ===
		UNRESTRICTED_CHAT_OAUTH_CONSENT_KIND;

const allowsScopeLessOAuthToken = async ({
	oauthConsentId,
}: {
	oauthConsentId: string | null;
}) => {
	if (!oauthConsentId) return false;
	const metadata = await oauthConsentRepo.getMetadataById({
		db,
		consentId: oauthConsentId,
	});
	return isUnrestrictedChatOAuthConsentMetadata(metadata);
};

// better-auth issues a stateless JWT access token whenever a `resource`
// (audience) is present, which never lands in oauth_access_token and so can't
// be validated by handleOAuthMiddleware or linked to a consent. Drop `resource`
// before better-auth sees it to force an opaque, persisted token; we keep the
// original `resource` (read above) for our own MCP/audience handling.
const stripResourceParam = async (request: Request): Promise<Request> => {
	const contentType = request.headers.get("content-type") ?? "";
	const rawBody = await request.text();
	if (!rawBody) return request;

	if (contentType.includes("application/json")) {
		try {
			const body = JSON.parse(rawBody) as Record<string, unknown>;
			delete body.resource;
			return new Request(request, { body: JSON.stringify(body) });
		} catch {
			return new Request(request, { body: rawBody });
		}
	}

	const params = new URLSearchParams(rawBody);
	params.delete("resource");
	return new Request(request, { body: params });
};

export const handleOAuthTokenWithApiKey = async (c: Context) => {
	const resource = await getResourceFromOAuthTokenRequest(c.req.raw.clone());
	const refreshTokenConsentId = await getRefreshTokenConsentId(
		c.req.raw.clone(),
	);
	const response = await auth.handler(
		await stripResourceParam(c.req.raw.clone()),
	);
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
		const oauthConsentId =
			tokenRecord.oauthConsentId ??
			refreshTokenConsentId ??
			(await getUniqueOAuthConsentId({
				clientId: tokenRecord.clientId,
				referenceId: tokenRecord.referenceId,
				userId: tokenRecord.userId,
			}));
		tokenRecord.oauthConsentId = oauthConsentId;
		const isMcpClient = await isMcpOAuthClient({
			clientId: tokenRecord.clientId,
			db,
			resource: resource ?? undefined,
		});
		const isScopeLessChatToken =
			tokenRecord.scopes.length === 0 &&
			isMcpClient &&
			(await allowsScopeLessOAuthToken({ oauthConsentId }));
		if (tokenRecord.scopes.length === 0 && !isScopeLessChatToken) {
			throw new RecaseError({
				message: "OAuth token has no scopes",
				code: ErrCode.InvalidRequest,
				statusCode: 401,
			});
		}
		const issuedScopes = isScopeLessChatToken
			? []
			: tokenRecord.clientId === AUTUMN_ADMIN_OAUTH_CLIENT_ID
				? (parsedRequestedScopes ?? tokenRecord.scopes)
				: await getOAuthConsentScopeGrant({
						db,
						organizationId: tokenRecord.referenceId,
						requestedScopes: parsedRequestedScopes ?? tokenRecord.scopes,
						userId: tokenRecord.userId,
					});
		tokenRecord.scopes = issuedScopes;
		if (tokenRecord.id) {
			await oauthAccessTokenRepo.updateScopes({
				db,
				id: tokenRecord.id,
				scopes: tokenRecord.scopes,
			});
			if (oauthConsentId) {
				await oauthAccessTokenRepo.updateConsent({
					db,
					id: tokenRecord.id,
					oauthConsentId,
				});
			}
		}
		if (tokenRecord.refreshId) {
			await oauthRefreshTokenRepo.updateScopes({
				db,
				id: tokenRecord.refreshId,
				scopes: issuedScopes,
			});
			if (oauthConsentId) {
				await oauthRefreshTokenRepo.updateConsent({
					db,
					id: tokenRecord.refreshId,
					oauthConsentId,
				});
			}
		}
		if (isMcpClient && !tokenRecord.oauthConsentId) {
			throw new RecaseError({
				message: "OAuth token consent is ambiguous",
				code: ErrCode.InvalidRequest,
				statusCode: 401,
			});
		}
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
