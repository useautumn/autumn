import { LEAF_OAUTH_SCOPES } from "@autumn/shared/leafOAuthScopes";
import { OPENID_SCOPES } from "@autumn/shared/scopeDefinitions";

const leafScopeSet = new Set<string>(LEAF_OAUTH_SCOPES);
const oauthPassthroughScopeSet = new Set<string>(["offline_access"]);
const oauthProtocolScopeSet = new Set<string>(OPENID_SCOPES);

export const getDefaultOAuthScopes = (requestedScopes?: string[] | null) => {
	const requested =
		requestedScopes && requestedScopes.length > 0
			? requestedScopes
			: [...LEAF_OAUTH_SCOPES, ...oauthPassthroughScopeSet];

	return [...new Set(requested)].filter(
		(scope) => leafScopeSet.has(scope) || oauthPassthroughScopeSet.has(scope),
	);
};

export const getOAuthResourceScopes = <T extends string>(scopes: readonly T[]) =>
	scopes.filter((scope) => !oauthProtocolScopeSet.has(scope));
