import { LEAF_OAUTH_SCOPES } from "@autumn/shared/leafOAuthScopes";
import {
	LEGACY_SCOPE_ALIASES,
	OPENID_SCOPES,
} from "@autumn/shared/scopeDefinitions";

const leafScopeSet = new Set<string>(LEAF_OAUTH_SCOPES);
const oauthProtocolScopeSet = new Set<string>(OPENID_SCOPES);

const isLeafScope = (scope: string) =>
	leafScopeSet.has(LEGACY_SCOPE_ALIASES[scope] ?? scope);

export const getDefaultOAuthScopes = (requestedScopes?: string[] | null) => {
	const requested =
		requestedScopes && requestedScopes.length > 0
			? requestedScopes
			: [...LEAF_OAUTH_SCOPES, ...OPENID_SCOPES];

	// Issued scopes must echo the client's request verbatim (better-auth
	// rejects rewrites), so legacy CRUDL aliases are used for filtering only.
	const filtered = [...new Set(requested)].filter(
		(scope) => isLeafScope(scope) || oauthProtocolScopeSet.has(scope),
	);

	// Clients that only request OIDC protocol scopes (e.g. Claude Code sends
	// "openid profile email offline_access") would otherwise receive a token
	// with no resource scopes, which 401s on every API call. Grant the full
	// Leaf scope set so the token can actually reach the MCP API.
	if (!filtered.some(isLeafScope)) {
		return [...LEAF_OAUTH_SCOPES, ...filtered];
	}

	return filtered;
};

export const getOAuthResourceScopes = <T extends string>(scopes: readonly T[]) =>
	scopes.filter((scope) => !oauthProtocolScopeSet.has(scope));
