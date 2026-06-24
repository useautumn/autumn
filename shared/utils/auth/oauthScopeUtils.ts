import {
	DEFAULT_OAUTH_RESOURCE_SCOPES,
	OAUTH_PROTOCOL_SCOPES,
} from "./autumnOAuthScopes";
import {
	LEGACY_SCOPE_ALIASES,
	isModernScope,
	parseScope,
	type ResourceType,
	type ScopeString,
} from "../scopeDefinitions";

const oauthProtocolScopeSet = new Set<string>(OAUTH_PROTOCOL_SCOPES);

export const isOAuthResourceScope = (scope: string) =>
	isModernScope(LEGACY_SCOPE_ALIASES[scope] ?? scope);

export const isOAuthProtocolScope = (scope: string) =>
	oauthProtocolScopeSet.has(scope);

export const getRequestedOAuthResourceScopes = (
	scopes?: readonly string[] | null,
) => [...new Set(scopes ?? [])].filter(isOAuthResourceScope);

export const getSelectableOAuthResourceScopes = (
	scopes?: readonly string[] | null,
) => {
	const selected = getRequestedOAuthResourceScopes(scopes)
		.map((scope) => LEGACY_SCOPE_ALIASES[scope] ?? scope)
		.filter(isModernScope);

	return selected.length > 0 ? selected : [...DEFAULT_OAUTH_RESOURCE_SCOPES];
};

export const getOAuthProtocolScopes = (scopes?: readonly string[] | null) =>
	[...new Set(scopes ?? [])].filter(isOAuthProtocolScope);

export const getOAuthResourcesForScopes = (scopes: readonly string[]) =>
	[
		...new Set(
			scopes
				.map((scope) => parseScope(LEGACY_SCOPE_ALIASES[scope] ?? scope).resource)
				.filter((resource): resource is ResourceType => !!resource),
		),
	];
