import { META_SCOPES, OFFLINE_ACCESS_SCOPE } from "@autumn/shared";
import { splitOAuthScopeString } from "@autumn/shared/utils/auth/oauthScopeUtils";

const META_SCOPE_SET = new Set<string>(META_SCOPES);

/**
 * MCP clients build their /authorize scope from the resource metadata and the
 * `WWW-Authenticate` challenge, which advertise resource scopes only, but
 * better-auth mints a refresh token only when the authorization request itself
 * names `offline_access`. Adding it here keeps the resource metadata RFC 9728
 * clean while still giving every MCP client a renewable grant.
 *
 * Meta scopes are dropped, and `offline_access` is added only when the client
 * is registered for it, so the rewritten request cannot fail `invalid_scope`.
 */
export const getMcpAuthorizeScopes = ({
	clientScopes,
	requestedScope,
}: {
	clientScopes: readonly string[] | null | undefined;
	requestedScope: string;
}): string[] => {
	const requested = splitOAuthScopeString(requestedScope).filter(
		(scope) => !META_SCOPE_SET.has(scope),
	);

	const clientAllowsOfflineAccess =
		!clientScopes?.length || clientScopes.includes(OFFLINE_ACCESS_SCOPE);
	if (!clientAllowsOfflineAccess) return requested;

	return [...new Set([...requested, OFFLINE_ACCESS_SCOPE])];
};
