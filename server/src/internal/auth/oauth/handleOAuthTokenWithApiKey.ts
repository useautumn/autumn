import { prefixOAuthToken } from "@autumn/auth";
import { returnsOAuthAccessTokenForClientId } from "@autumn/auth/oauth";
import { ErrCode, RecaseError } from "@autumn/shared";
import { asNonEmptyString } from "@autumn/shared/utils/auth/oauthRequestBody";
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
	jsonOAuthTokenResponse,
	parseOAuthTokenResponseBody,
} from "./token/oauthTokenResponse.js";
import { parseOAuthTokenResponseScopes } from "./token/parseOAuthTokenResponseScopes.js";
import { persistOAuthTokenGrant } from "./token/persistOAuthTokenGrant.js";
import { resolveIssuedOAuthScopes } from "./token/resolveIssuedOAuthScopes.js";
import { resolveOAuthTokenConsentId } from "./token/resolveOAuthTokenConsentId.js";
import { setupOAuthTokenRequest } from "./token/setupOAuthTokenRequest.js";

export const handleOAuthTokenWithApiKey = async (c: Context) => {
	let heldReplayKey: string | null = null;
	// A held claim blocks every concurrent replay, so an exit that stores no
	// response must hand the key back instead of letting it time out.
	let replayStored = false;
	try {
		// 1. Setup
		const tokenRequest = await setupOAuthTokenRequest({
			db,
			request: c.req.raw,
		});

		// 2. Single-flight guard: refresh tokens are single-use and rotated, so
		// byte-identical replays of one refresh request must share the winner's
		// response. A Redis outage leaves `heldReplayKey` null and the request mints
		// unguarded — dedupe is an optimisation, not a dependency.
		if (tokenRequest.refreshReplayKey) {
			const replay = await claimOAuthRefreshReplay(
				tokenRequest.refreshReplayKey,
			);
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
			if (replay.holdsKey) heldReplayKey = tokenRequest.refreshReplayKey;
		}

		// 3. better-auth mints the token
		const response = await auth.handler(tokenRequest.normalizedRequest);
		if (!response.ok) return response;

		const body = await parseOAuthTokenResponseBody(response);
		if (!body) return response;

		const accessToken = asNonEmptyString(body.access_token);
		if (!accessToken) return response;

		// 4. Read back the scopes better-auth granted
		const { scopes: requestedScopes, resourceScopes: requestedResourceScopes } =
			parseOAuthTokenResponseScopes({ scope: body.scope });

		// 5. Bind the minted token to its consent and to the scopes that consent still backs
		const tokenRecord = await getOAuthAccessTokenRecord({
			db,
			accessToken,
			resource: tokenRequest.resource,
			requestedScopes: requestedResourceScopes,
		});
		const oauthConsentId = await resolveOAuthTokenConsentId({
			db,
			refreshTokenRecord: tokenRequest.refreshTokenRecord,
			tokenRecord,
		});
		const consentedTokenRecord = { ...tokenRecord, oauthConsentId };

		const isMcpClient = await isMcpOAuthClient({
			clientId: tokenRecord.clientId,
			db,
		});
		const issuedScopes = await resolveIssuedOAuthScopes({
			db,
			isMcpClient,
			requestedScopes,
			tokenRecord: consentedTokenRecord,
		});

		if (isMcpClient && !oauthConsentId) {
			throw new RecaseError({
				message: "OAuth token consent is ambiguous",
				code: ErrCode.InvalidRequest,
			});
		}

		await persistOAuthTokenGrant({
			accessTokenId: tokenRecord.id,
			db,
			oauthConsentId,
			refreshTokenId: tokenRecord.refreshId,
			resource: tokenRequest.resource,
			scopes: issuedScopes,
		});

		// 6. MCP and reserved clients keep the opaque OAuth token
		if (
			isMcpClient ||
			returnsOAuthAccessTokenForClientId({ clientId: tokenRecord.clientId })
		) {
			const responseBody = {
				...body,
				access_token: prefixOAuthToken({ token: accessToken }),
				scope: issuedScopes.join(" "),
			};
			if (heldReplayKey) {
				await storeOAuthRefreshReplay({
					body: responseBody,
					key: heldReplayKey,
				});
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
			tokenRecord: { ...consentedTokenRecord, scopes: issuedScopes },
			requestedScopes: requestedResourceScopes,
		});
		if (!apiKeyResult) return response;

		return jsonOAuthTokenResponse({
			body: {
				...body,
				access_token: apiKeyResult.apiKey,
				scope: apiKeyResult.scopes.join(" "),
			},
			response,
			status: response.status,
		});
	} catch (error) {
		const errorResponse = oauthTokenErrorResponse({ error });
		if (errorResponse) return errorResponse;
		throw error;
	} finally {
		if (heldReplayKey && !replayStored) {
			await releaseOAuthRefreshReplay(heldReplayKey);
		}
	}
};
