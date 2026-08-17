import { prefixOAuthToken } from "@autumn/auth";
import { returnsOAuthAccessTokenForClientId } from "@autumn/auth/oauth";
import { ErrCode, RecaseError } from "@autumn/shared";
import { getOAuthStringField } from "@autumn/shared/utils/auth/oauthRequestBody";
import type { Context } from "hono";
import { db } from "@/db/initDrizzle.js";
import {
	claimOAuthRefreshReplay,
	releaseOAuthRefreshReplay,
	storeOAuthRefreshReplay,
} from "@/external/redis/actions/oauthRefreshReplay/oauthRefreshReplay.js";
import { auth } from "@/utils/auth.js";
import { isMcpOAuthClient } from "./mcpOAuthScopes.js";
import {
	getExternalOAuthApiKeyForToken,
	getOAuthAccessTokenRecord,
} from "./oauthAccessTokenApiKey.js";
import { oauthTokenErrorResponse } from "./token/oauthTokenErrorResponse.js";
import {
	getOAuthTokenPayload,
	jsonOAuthTokenResponse,
	parseOAuthTokenResponseBody,
	rewriteOAuthTokenResponseBody,
} from "./token/oauthTokenResponse.js";
import { parseOAuthTokenResponseScopes } from "./token/parseOAuthTokenResponseScopes.js";
import { persistOAuthTokenGrant } from "./token/persistOAuthTokenGrant.js";
import { resolveIssuedOAuthScopes } from "./token/resolveIssuedOAuthScopes.js";
import { resolveOAuthTokenConsentId } from "./token/resolveOAuthTokenConsentId.js";
import { resolveOAuthTokenResource } from "./token/resolveOAuthTokenResource.js";
import { setupOAuthTokenRequest } from "./token/setupOAuthTokenRequest.js";

export const handleOAuthTokenWithApiKey = async (c: Context) => {
	// 1. Setup
	const tokenRequest = await setupOAuthTokenRequest({ db, request: c.req.raw });

	// 2. Single-flight guard: refresh tokens are single-use and rotated, so
	// concurrent replays of one token must share the winner's response.
	const replayKey = tokenRequest.refreshReplayKey;
	if (replayKey) {
		const replay = await claimOAuthRefreshReplay(replayKey);
		if (!replay) {
			return jsonOAuthTokenResponse({
				body: {
					error: "temporarily_unavailable",
					error_description: "Refresh request coordination unavailable",
				},
				status: 503,
			});
		}
		if (replay.body) {
			return jsonOAuthTokenResponse({ body: replay.body, status: 200 });
		}
	}

	// A held claim blocks every concurrent replay, so an exit that stores no
	// response must hand the key back instead of letting it time out.
	let replayStored = false;
	try {
		// 3. better-auth mints the token
		const response = await auth.handler(tokenRequest.normalizedRequest);
		if (!response.ok) return response;

		const body = await parseOAuthTokenResponseBody(response);
		if (!body) return response;

		const tokenPayload = getOAuthTokenPayload(body);
		const accessToken = getOAuthStringField(tokenPayload.access_token);
		if (!accessToken) return response;

		// 4. Read back the scopes better-auth granted
		const { scopes: requestedScopes, resourceScopes: requestedResourceScopes } =
			parseOAuthTokenResponseScopes({ scope: tokenPayload.scope });

		// 5. Bind the minted token to its consent and to the scopes that consent still backs
		const tokenRecord = await getOAuthAccessTokenRecord({
			db,
			accessToken,
			resource: tokenRequest.resource,
			requestedScopes: requestedResourceScopes,
		});
		tokenRecord.oauthConsentId = await resolveOAuthTokenConsentId({
			db,
			refreshTokenRecord: tokenRequest.refreshTokenRecord,
			tokenRecord,
		});

		const isMcpClient = await isMcpOAuthClient({
			clientId: tokenRecord.clientId,
			db,
		});
		tokenRecord.scopes = await resolveIssuedOAuthScopes({
			db,
			isMcpClient,
			requestedScopes,
			tokenRecord,
		});

		if (isMcpClient && !tokenRecord.oauthConsentId) {
			throw new RecaseError({
				message: "OAuth token consent is ambiguous",
				code: ErrCode.InvalidRequest,
				statusCode: 401,
			});
		}

		await persistOAuthTokenGrant({
			accessTokenId: tokenRecord.id,
			db,
			oauthConsentId: tokenRecord.oauthConsentId,
			refreshTokenId: tokenRecord.refreshId,
			resource: resolveOAuthTokenResource({
				refreshTokenRecord: tokenRequest.refreshTokenRecord,
				requestResource: tokenRequest.resource,
			}),
			scopes: tokenRecord.scopes,
		});

		// 6. MCP and reserved clients keep the opaque OAuth token
		if (
			isMcpClient ||
			returnsOAuthAccessTokenForClientId({ clientId: tokenRecord.clientId })
		) {
			const responseBody = rewriteOAuthTokenResponseBody({
				body,
				scopes: tokenRecord.scopes,
				token: prefixOAuthToken({ token: accessToken }),
			});
			if (replayKey) {
				await storeOAuthRefreshReplay({ body: responseBody, key: replayKey });
				replayStored = true;
			}

			return jsonOAuthTokenResponse({
				body: responseBody,
				response,
				status: response.status,
			});
		}

		// 7. Everyone else exchanges the token for a scoped api key
		const apiKeyResult = await getExternalOAuthApiKeyForToken({
			db,
			tokenRecord,
			requestedScopes: requestedResourceScopes,
		});
		if (!apiKeyResult) return response;

		return jsonOAuthTokenResponse({
			body: rewriteOAuthTokenResponseBody({
				body,
				scopes: apiKeyResult.scopes,
				token: apiKeyResult.apiKey,
			}),
			response,
			status: response.status,
		});
	} catch (error) {
		const errorResponse = oauthTokenErrorResponse({ error });
		if (errorResponse) return errorResponse;
		throw error;
	} finally {
		if (replayKey && !replayStored) await releaseOAuthRefreshReplay(replayKey);
	}
};
