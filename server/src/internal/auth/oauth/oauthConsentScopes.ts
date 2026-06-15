import {
	getDefaultOAuthScopes,
	getOAuthResourceScopes,
} from "@autumn/auth/oauth";
import { ErrCode, isScopeSubset, RecaseError } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { getScopesForUserInOrg } from "@/utils/authUtils/customSessionScopes.js";

export const getOAuthConsentScopeGrant = async ({
	db,
	organizationId,
	requestedScopes,
	userId,
}: {
	db: DrizzleCli;
	organizationId: string;
	requestedScopes?: string[] | null;
	userId: string;
}) => {
	const finalRequestedScopes = getDefaultOAuthScopes(requestedScopes);
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
