import {
	parseOAuthRequestFields,
	rebuildOAuthRequest,
} from "@autumn/shared/utils/auth/oauthRequestBody";
import { splitOAuthScopeString } from "@autumn/shared/utils/auth/oauthScopeUtils";

/**
 * Drops requested scopes the grant does not carry. A request that names only
 * foreign scopes is forwarded unchanged rather than blanked: better-auth then
 * rejects it with `invalid_scope` naming the offending scope, whereas an empty
 * or absent `scope` would read as "no scope requested" and re-issue the grant's
 * full set — the widening this narrowing exists to prevent.
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
 * Rewrites the token request before better-auth sees it.
 *
 * `resource` is dropped because better-auth treats it as a JWT switch: any
 * audience on the request makes it sign a JWT access token and skip writing the
 * `oauth_access_token` row entirely, and every Autumn resource server
 * authenticates by looking that row up. The audience is not lost — the row
 * carries it, stamped by `persistOAuthTokenGrant` once the grant is issued.
 *
 * `scope` is narrowed so an MCP refresh cannot widen its original grant.
 */
export const normalizeOAuthTokenRequest = async ({
	grantedScopes,
	request,
}: {
	grantedScopes?: string[];
	request: Request;
}): Promise<Request> => {
	const { fields, isJson, rawBody } = await parseOAuthRequestFields(request);
	if (!rawBody) return request;
	if (isJson && Object.keys(fields).length === 0) {
		return new Request(request, { body: rawBody });
	}

	delete fields.resource;
	if (grantedScopes && typeof fields.scope === "string") {
		fields.scope = constrainScopeToGrant({
			grantedScopes,
			scope: fields.scope,
		});
	}

	return rebuildOAuthRequest({ fields, isJson, request });
};
