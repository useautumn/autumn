import { getResourceFromOAuthTokenRequest } from "@autumn/auth/oauth";
import { hashOAuthToken } from "@autumn/shared/utils/auth/oauthAccessTokens";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { buildOAuthRefreshReplayKey } from "@/external/redis/actions/oauthRefreshReplay/oauthRefreshReplay.js";
import { isMcpOAuthClient } from "../mcpOAuthScopes.js";
import { getOAuthRefreshTokenRecord } from "./getOAuthRefreshTokenRecord.js";
import { normalizeOAuthTokenRequest } from "./normalizeOAuthTokenRequest.js";

export type OAuthTokenRequestContext = {
	normalizedRequest: Request;
	/** Non-null only for MCP refreshes, the one grant whose replays must agree. */
	refreshReplayKey: string | null;
	refreshTokenRecord: Awaited<ReturnType<typeof getOAuthRefreshTokenRecord>>;
	resource: string | null;
};

const buildReplayKeyForRequest = async ({
	request,
	resource,
}: {
	request: Request;
	resource: string | null;
}) => {
	const authorization = request.headers.get("authorization") ?? "";
	const rawBody = await request.clone().text();

	return buildOAuthRefreshReplayKey(
		await hashOAuthToken(`${resource ?? ""}\n${authorization}\n${rawBody}`),
	);
};

/** Resolves the grant being refreshed and rewrites the request better-auth will handle. */
export const setupOAuthTokenRequest = async ({
	db,
	request,
}: {
	db: DrizzleCli;
	request: Request;
}): Promise<OAuthTokenRequestContext> => {
	const resource = await getResourceFromOAuthTokenRequest(request.clone());
	const refreshTokenRecord = await getOAuthRefreshTokenRecord({
		db,
		request: request.clone(),
	});

	const grantedScopes =
		refreshTokenRecord &&
		(await isMcpOAuthClient({
			clientId: refreshTokenRecord.clientId,
			db,
			resource: resource ?? undefined,
		}))
			? refreshTokenRecord.scopes
			: undefined;

	const normalizedRequest = await normalizeOAuthTokenRequest({
		grantedScopes,
		request: request.clone(),
	});

	return {
		normalizedRequest,
		refreshReplayKey: grantedScopes
			? await buildReplayKeyForRequest({ request: normalizedRequest, resource })
			: null,
		refreshTokenRecord,
		resource,
	};
};
