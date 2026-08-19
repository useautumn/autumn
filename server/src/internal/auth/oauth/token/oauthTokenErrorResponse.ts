import { ErrCode, RecaseError } from "@autumn/shared";
import { jsonOAuthTokenResponse } from "./oauthTokenResponse.js";
import { OAuthTokenScopeError } from "./parseOAuthTokenResponseScopes.js";
import { OAuthTokenResourceError } from "./resolveOAuthTokenResource.js";

/**
 * RFC 6749 §5.2 fixes the token endpoint's error status at 400 for every code
 * here — 401 is reserved for client-authentication failures, which better-auth
 * has already settled by the time these throw. The internal status codes are
 * for Autumn's own API surface and do not belong on an OAuth error body.
 */
const OAUTH_TOKEN_ERROR_STATUS = 400;

/** Null for anything that is not an OAuth failure, which callers rethrow untouched. */
export const oauthTokenErrorResponse = ({ error }: { error: unknown }) => {
	if (error instanceof OAuthTokenResourceError) {
		return jsonOAuthTokenResponse({
			body: { error: "invalid_target", error_description: error.message },
			status: OAUTH_TOKEN_ERROR_STATUS,
		});
	}

	// The scope string itself is malformed, not the grant behind it.
	if (error instanceof OAuthTokenScopeError) {
		return jsonOAuthTokenResponse({
			body: { error: "invalid_scope", error_description: error.message },
			status: OAUTH_TOKEN_ERROR_STATUS,
		});
	}

	if (error instanceof RecaseError) {
		const isScopeFailure = error.code === ErrCode.InsufficientScopes;
		return jsonOAuthTokenResponse({
			body: {
				error: isScopeFailure ? "invalid_scope" : "invalid_grant",
				error_description: error.message,
			},
			status: OAUTH_TOKEN_ERROR_STATUS,
		});
	}

	return null;
};
