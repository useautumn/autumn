import { canonicalizeOAuthResource } from "@autumn/auth/oauth";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { isMcpOAuthClient } from "../mcpOAuthScopes.js";
import {
	getMcpOAuthResourceUrls,
	getOAuthValidAudiences,
} from "../oauthResourceAudiences.js";

/** RFC 8707 §2: the request named a resource this server does not serve. */
export class OAuthTokenResourceError extends Error {}

/**
 * The audiences a grant for this client may name. An MCP client only ever calls
 * an `/mcp` endpoint, so the bare API origin — a legitimate audience for API
 * clients — is a misdirected grant there, and one no later request can undo:
 * the audience is stamped on the token and inherited by every refresh.
 */
const getServedAudiences = async ({
	clientId,
	db,
}: {
	clientId: string | null;
	db: DrizzleCli;
}) => {
	if (clientId && (await isMcpOAuthClient({ clientId, db }))) {
		return getMcpOAuthResourceUrls();
	}

	return getOAuthValidAudiences();
};

const servesResource = async ({
	clientId,
	db,
	resource,
}: {
	clientId: string | null;
	db: DrizzleCli;
	resource: string;
}) => {
	const audiences = await getServedAudiences({ clientId, db });
	return audiences.some(
		(audience) => canonicalizeOAuthResource(audience) === resource,
	);
};

/**
 * Resolves the canonical audience to stamp on the grant being issued.
 *
 * The refresh chain owns its audience: clients routinely omit `resource` on
 * refresh, and a rotated token must never widen or drop what it was granted.
 * A refresh that names a resource anyway is therefore decorative — validating
 * it would only break chains that already refresh cleanly today.
 *
 * Anything else the request names is stamped, so it is checked first: an
 * audience this server does not serve produces a token that authenticates
 * nowhere, which RFC 8707 §2 requires be refused as `invalid_target`.
 */
export const resolveOAuthTokenResource = async ({
	clientId,
	db,
	grantResource,
	requestResource,
}: {
	clientId: string | null;
	db: DrizzleCli;
	grantResource: string | null | undefined;
	requestResource: string | null;
}): Promise<string | null> => {
	if (grantResource) return canonicalizeOAuthResource(grantResource);
	if (!requestResource) return null;

	const resource = canonicalizeOAuthResource(requestResource);
	if (!resource || !(await servesResource({ clientId, db, resource }))) {
		throw new OAuthTokenResourceError(
			`This authorization server issues no tokens for resource ${requestResource}`,
		);
	}

	return resource;
};
