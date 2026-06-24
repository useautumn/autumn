import {
	DEFAULT_OAUTH_RESOURCE_SCOPES,
	OAUTH_PROTOCOL_SCOPES,
} from "@autumn/shared/utils/auth/autumnOAuthScopes";
import {
	getOAuthProtocolScopes as getSharedOAuthProtocolScopes,
	getRequestedOAuthResourceScopes,
	isOAuthProtocolScope,
} from "@autumn/shared/utils/auth/oauthScopeUtils";

export const getDefaultOAuthScopes = (requestedScopes?: string[] | null) => {
	const requested =
		requestedScopes && requestedScopes.length > 0
			? requestedScopes
			: DEFAULT_OAUTH_RESOURCE_SCOPES;
	const requestedResourceScopes = getRequestedOAuthResourceScopes(requested);
	const resourceScopes =
		requestedResourceScopes.length > 0
			? requestedResourceScopes
			: DEFAULT_OAUTH_RESOURCE_SCOPES;

	return [...new Set([...resourceScopes, ...OAUTH_PROTOCOL_SCOPES])];
};

export const getOAuthResourceScopes = <T extends string>(scopes: readonly T[]) =>
	scopes.filter((scope) => !isOAuthProtocolScope(scope));

export const getOAuthProtocolScopes = getSharedOAuthProtocolScopes;
