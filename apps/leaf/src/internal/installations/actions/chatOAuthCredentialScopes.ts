import { DEFAULT_OAUTH_RESOURCE_SCOPES } from "@autumn/shared";

const defaultOAuthResourceScopeSet = new Set<string>(
	DEFAULT_OAUTH_RESOURCE_SCOPES,
);

export const scopeSetsEqual = (a: string[], b: string[]) => {
	const aSet = new Set(a);
	const bSet = new Set(b);
	if (aSet.size !== bSet.size) {
		return false;
	}
	return [...bSet].every((scope) => aSet.has(scope));
};

/**
 * Bounds the requested scopes to the bot's ceiling. `undefined` grants the
 * default set; an empty or fully out-of-ceiling list throws instead of
 * failing open.
 */
export const resolveAgentScopes = (agentScopes?: string[]) => {
	if (agentScopes === undefined) {
		return [...DEFAULT_OAUTH_RESOURCE_SCOPES];
	}
	if (agentScopes.length === 0) {
		throw new Error(
			"resolveAgentScopes: refusing to mint default scopes from an empty scope list",
		);
	}
	const bounded = [
		...new Set(
			agentScopes.filter((scope) => defaultOAuthResourceScopeSet.has(scope)),
		),
	];
	if (bounded.length === 0) {
		throw new Error(
			"resolveAgentScopes: requested scopes are entirely outside the bot ceiling",
		);
	}
	return bounded;
};
