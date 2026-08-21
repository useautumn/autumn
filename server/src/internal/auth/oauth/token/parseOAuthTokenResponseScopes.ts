import { isValidScope, type ScopeString } from "@autumn/shared";
import {
	isOAuthProtocolScope,
	splitOAuthScopeString,
} from "@autumn/shared/utils/auth/oauthScopeUtils";

/** Distinguishes a bad scope string from the grant failures the catch maps to invalid_grant. */
export class OAuthTokenScopeError extends Error {
	name = "OAuthTokenScopeError";
}

/** A scope this server no longer defines makes the grant unusable, so it throws. */
export const parseOAuthTokenResponseScopes = ({
	scope,
}: {
	scope: unknown;
}): { scopes: string[] | null; resourceScopes: ScopeString[] | null } => {
	if (typeof scope !== "string") return { scopes: null, resourceScopes: null };

	const scopes: string[] = [];
	const resourceScopes: ScopeString[] = [];
	const undefinedScopes: string[] = [];

	for (const candidate of splitOAuthScopeString(scope)) {
		if (!isValidScope(candidate)) {
			undefinedScopes.push(candidate);
			continue;
		}
		scopes.push(candidate);
		if (!isOAuthProtocolScope(candidate)) resourceScopes.push(candidate);
	}

	if (undefinedScopes.length > 0) {
		throw new OAuthTokenScopeError(
			`Token response names undefined scopes: ${undefinedScopes.join(", ")}`,
		);
	}

	return { scopes, resourceScopes };
};
