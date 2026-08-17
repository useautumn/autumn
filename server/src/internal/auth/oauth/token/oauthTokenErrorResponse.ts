import { RecaseError } from "@autumn/shared";
import { jsonOAuthTokenResponse } from "./oauthTokenResponse.js";
import { OAuthTokenScopeError } from "./parseOAuthTokenResponseScopes.js";

/** Null for anything that is not an OAuth failure, which callers rethrow untouched. */
export const oauthTokenErrorResponse = ({ error }: { error: unknown }) => {
	// RFC 6749 §5.2: the scope itself is malformed, not the grant behind it.
	if (error instanceof OAuthTokenScopeError) {
		return jsonOAuthTokenResponse({
			body: { error: "invalid_scope", error_description: error.message },
			status: 400,
		});
	}

	if (error instanceof RecaseError) {
		return jsonOAuthTokenResponse({
			body: { error: "invalid_grant", error_description: error.message },
			status: error.statusCode,
		});
	}

	return null;
};
