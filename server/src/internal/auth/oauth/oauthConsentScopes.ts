import {
	getDefaultOAuthScopes,
	getOAuthResourceScopes,
} from "@autumn/auth/oauth";
import {
	ErrCode,
	getRequestedOAuthResourceScopes,
	isScopeSubset,
	RecaseError,
} from "@autumn/shared";
import { getScopesForUserInOrg } from "@autumn/shared/utils/auth/getScopesForUserInOrg";
import type { DrizzleCli } from "@/db/initDrizzle.js";

export const getOAuthConsentScopeGrant = async ({
	db,
	organizationId,
	requestedScopes,
	requireRequestedResourceScopes = false,
	userId,
}: {
	db: DrizzleCli;
	organizationId: string;
	requestedScopes?: string[] | null;
	requireRequestedResourceScopes?: boolean;
	userId: string;
}) => {
	if (
		requireRequestedResourceScopes &&
		getRequestedOAuthResourceScopes(requestedScopes ?? []).length === 0
	) {
		throw new RecaseError({
			message: "At least one Autumn resource scope must be selected",
			code: ErrCode.InsufficientScopes,
			statusCode: 403,
		});
	}

	// An explicit selection must be granted as-is so the result stays a subset
	// of the app's original /authorize scopes — better-auth rejects consent
	// with "Scope not originally requested" if we inject protocol scopes
	// (e.g. profile/email) the client never asked for.
	const finalRequestedScopes = requireRequestedResourceScopes
		? (requestedScopes ?? [])
		: getDefaultOAuthScopes(requestedScopes);
	const { scopes: userScopes } = await getScopesForUserInOrg({
		db,
		userId,
		organizationId,
	});

	const resourceScopes = getOAuthResourceScopes(finalRequestedScopes);
	const resourceGrant = resourceScopes.filter((scope) =>
		isScopeSubset([scope], userScopes),
	);
	if (resourceGrant.length === 0) {
		throw new RecaseError({
			message: "No requested scopes can be granted to this OAuth client",
			code: ErrCode.InsufficientScopes,
			statusCode: 403,
		});
	}

	const grantedResourceScopes = new Set(resourceGrant);
	return finalRequestedScopes.filter(
		(scope) =>
			!resourceScopes.includes(scope) || grantedResourceScopes.has(scope),
	);
};
