import { META_SCOPES, OFFLINE_ACCESS_SCOPE } from "@autumn/shared";
import { splitOAuthScopeString } from "@autumn/shared/utils/auth/oauthScopeUtils";

const META_SCOPE_SET = new Set<string>(META_SCOPES);

/**
 * better-auth only mints a refresh token when the authorization request itself
 * names `offline_access`, but MCP clients build that request from the resource
 * metadata / `WWW-Authenticate` challenge, which advertise resource scopes only
 * (RFC 9728 `scopes_supported` describes access to the resource, and a refresh
 * token is not resource access). Adding it here keeps the resource-facing
 * metadata spec-clean while still giving every MCP client a renewable grant.
 *
 * It is only added when the client is registered for it, so a reserved client
 * whose stored grant omits `offline_access` is never redirected to
 * `invalid_scope`. A client that stores no scopes at all falls back to the
 * provider-wide scope list, which does include it.
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
