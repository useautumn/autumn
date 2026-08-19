import {
	type ParsedOAuthRequest,
	rebuildOAuthRequest,
} from "@autumn/shared/utils/auth/oauthRequestBody";
import { splitOAuthScopeString } from "@autumn/shared/utils/auth/oauthScopeUtils";

/**
 * A request naming only foreign scopes is forwarded unchanged rather than
 * blanked: better-auth rejects it as `invalid_scope`, whereas an absent `scope`
 * reads as "no scope requested" and re-issues the grant's full set.
 */
const constrainScopeToGrant = ({
	grantedScopes,
	scope,
}: {
	grantedScopes: string[];
	scope: string;
}) => {
	const granted = new Set(grantedScopes);
	const constrained = splitOAuthScopeString(scope).filter((value) =>
		granted.has(value),
	);
	return constrained.length > 0 ? constrained.join(" ") : scope;
};

/**
 * `resource` is dropped because better-auth treats it as a JWT switch: any
 * audience on the request makes it sign a JWT access token and skip writing the
 * `oauth_access_token` row every Autumn resource server authenticates against.
 * The audience is not lost — `persistOAuthTokenGrant` stamps it on that row.
 */
export const normalizeOAuthTokenRequest = ({
	grantedScopes,
	parsedRequest,
	request,
}: {
	grantedScopes?: string[];
	parsedRequest: ParsedOAuthRequest;
	request: Request;
}): Request => {
	const { isJson, rawBody } = parsedRequest;
	if (!rawBody) return request;
	if (isJson && Object.keys(parsedRequest.fields).length === 0) {
		return new Request(request, { body: rawBody });
	}

	const fields = { ...parsedRequest.fields };
	delete fields.resource;
	if (grantedScopes && typeof fields.scope === "string") {
		fields.scope = constrainScopeToGrant({
			grantedScopes,
			scope: fields.scope,
		});
	}

	return rebuildOAuthRequest({ fields, isJson, request });
};
