import { getResourceFromOAuthTokenRequest } from "@autumn/auth/oauth";
import type { oauthRefreshToken } from "@autumn/shared";
import { hashOAuthToken } from "@autumn/shared/utils/auth/oauthAccessTokens";
import { parseOAuthRequestFields } from "@autumn/shared/utils/auth/oauthRequestBody";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { buildOAuthRefreshReplayKey } from "@/external/redis/actions/oauthRefreshReplay/oauthRefreshReplay.js";
import { isMcpOAuthClient } from "../mcpOAuthScopes.js";
import { getOAuthTokenRequestFields } from "../tokenRequestFields.js";
import { getOAuthRefreshTokenRecord } from "./getOAuthRefreshTokenRecord.js";
import { normalizeOAuthTokenRequest } from "./normalizeOAuthTokenRequest.js";
import { resolveOAuthTokenResource } from "./resolveOAuthTokenResource.js";

export type OAuthTokenRequestContext = {
	/** The client this request speaks for; null when it authenticates over the header. */
	clientId: string | null;
	isMcpClient: boolean;
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
	// Read off the normalized request so the fingerprint covers the exact bytes
	// better-auth will see, not the body they were rewritten from.
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
	const parsedRequest = await parseOAuthRequestFields(request.clone());
	const tokenRequestFields = getOAuthTokenRequestFields(parsedRequest.fields);
	const refreshTokenRecord = await getOAuthRefreshTokenRecord({
		db,
		tokenRequestFields,
	});

	const clientId = refreshTokenRecord?.clientId ?? tokenRequestFields.clientId;
	const isMcpClient = clientId
		? await isMcpOAuthClient({ clientId, db })
		: false;

	const resource = resolveOAuthTokenResource({
		grantResource: refreshTokenRecord?.resource,
		isMcpClient,
		requestResource: getResourceFromOAuthTokenRequest(parsedRequest),
	});

	const grantedScopes =
		refreshTokenRecord && isMcpClient ? refreshTokenRecord.scopes : undefined;

	const normalizedRequest = normalizeOAuthTokenRequest({
		grantedScopes,
		parsedRequest,
		request,
	});

	return {
		clientId,
		isMcpClient,
		normalizedRequest,
		refreshReplayKey: grantedScopes
			? await buildReplayKeyForRequest({ request: normalizedRequest, resource })
			: null,
		refreshTokenRecord,
		resource,
	};
};
