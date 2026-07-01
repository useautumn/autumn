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
 * Bound the requested scopes to the bot's ceiling.
 *
 * - `undefined` is the install/default path: grant the full default set.
 * - An explicit empty list is never the default set — it means a caller resolved
 *   *no* permissions (e.g. a denied Slack user that slipped past the guard), so we
 *   throw rather than silently mint full default scopes (which would fail open).
 * - A non-empty list is intersected with the ceiling; if nothing survives, the
 *   caller asked only for scopes the bot can never hold, so we throw too.
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
