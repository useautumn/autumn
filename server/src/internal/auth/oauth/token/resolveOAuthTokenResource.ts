import { canonicalizeOAuthResource } from "@autumn/auth/oauth";
import {
	getMcpOAuthResourceUrls,
	getOAuthValidAudiences,
} from "../oauthResourceAudiences.js";

/** RFC 8707 §2: the request named a resource this server does not serve. */
export class OAuthTokenResourceError extends Error {
	name = "OAuthTokenResourceError";
}

/**
 * Resolves the canonical audience to stamp on the grant being issued.
 *
 * The refresh chain owns its audience: clients routinely omit `resource` on
 * refresh, and a rotated token must never widen or drop what it was granted.
 * Anything else the request names is stamped, so an audience this server does
 * not serve is refused as `invalid_target` — an MCP client only ever calls an
 * `/mcp` endpoint, so the bare API origin is a misdirected grant there.
 */
export const resolveOAuthTokenResource = ({
	grantResource,
	isMcpClient,
	requestResource,
}: {
	grantResource: string | null | undefined;
	isMcpClient: boolean;
	requestResource: string | null;
}): string | null => {
	if (grantResource) return canonicalizeOAuthResource(grantResource);
	if (!requestResource) return null;

	const resource = canonicalizeOAuthResource(requestResource);
	const audiences = isMcpClient
		? getMcpOAuthResourceUrls()
		: getOAuthValidAudiences();

	if (
		!resource ||
		!audiences.some(
			(audience) => canonicalizeOAuthResource(audience) === resource,
		)
	) {
		throw new OAuthTokenResourceError(
			`This authorization server issues no tokens for resource ${requestResource}`,
		);
	}

	return resource;
};
