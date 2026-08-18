import {
	parseOAuthRequestFields,
	rebuildOAuthRequest,
} from "@autumn/shared/utils/auth/oauthRequestBody";
import { splitOAuthScopeString } from "@autumn/shared/utils/auth/oauthScopeUtils";

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
 * Rewrites the token request before better-auth sees it: `resource` is dropped
 * because resource tokens are JWTs this handler cannot link back to a consent,
 * and `scope` is narrowed so an MCP refresh cannot widen its original grant.
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
