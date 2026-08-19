import { getResourceFromOAuthTokenRequest } from "@autumn/auth/oauth";
import type { oauthRefreshToken } from "@autumn/shared";
import { hashOAuthToken } from "@autumn/shared/utils/auth/oauthAccessTokens";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { buildOAuthRefreshReplayKey } from "@/external/redis/actions/oauthRefreshReplay/oauthRefreshReplay.js";
import { isMcpOAuthClient } from "../mcpOAuthScopes.js";
import { getOAuthTokenRequestFields } from "../tokenRequestFields.js";
import { getOAuthRefreshTokenRecord } from "./getOAuthRefreshTokenRecord.js";
import { normalizeOAuthTokenRequest } from "./normalizeOAuthTokenRequest.js";
import { resolveOAuthTokenResource } from "./resolveOAuthTokenResource.js";

export type OAuthTokenRequestContext = {
	normalizedRequest: Request;
	/** Non-null only for MCP refreshes, the one grant whose replays must agree. */
	refreshReplayKey: string | null;
	refreshTokenRecord: typeof oauthRefreshToken.$inferSelect | null;
	/** Canonical audience this grant is stamped with, already resolved for refreshes. */
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
		hashOAuthToken(`${resource ?? ""}\n${authorization}\n${rawBody}`),
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
	const requestResource = await getResourceFromOAuthTokenRequest(
		request.clone(),
	);
	const refreshTokenRecord = await getOAuthRefreshTokenRecord({
		db,
		request: request.clone(),
	});
	const { clientId } = await getOAuthTokenRequestFields(request.clone());

	const resource = await resolveOAuthTokenResource({
		clientId: refreshTokenRecord?.clientId ?? clientId,
		db,
		grantResource: refreshTokenRecord?.resource,
		requestResource,
	});

	const grantedScopes =
		refreshTokenRecord &&
		(await isMcpOAuthClient({ clientId: refreshTokenRecord.clientId, db }))
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
