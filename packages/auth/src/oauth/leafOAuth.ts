import { LEAF_OAUTH_SCOPES } from "@autumn/shared/leafOAuthScopes";
import type { ScopeString } from "@autumn/shared/scopeDefinitions";

const leafScopeSet = new Set<string>(LEAF_OAUTH_SCOPES);

export const getDefaultOAuthScopes = (requestedScopes?: string[] | null) => {
	const requested =
		requestedScopes && requestedScopes.length > 0
			? requestedScopes
			: [...LEAF_OAUTH_SCOPES];

	return [...new Set(requested)].filter((scope): scope is ScopeString =>
		leafScopeSet.has(scope),
	);
};
