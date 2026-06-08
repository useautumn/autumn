import { getDefaultOAuthScopes } from "@autumn/auth/oauth";
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

	const grant = finalRequestedScopes.filter((scope) =>
		isScopeSubset([scope], userScopes),
	);
	if (grant.length > 0) return grant;

	throw new RecaseError({
		message: "No requested scopes can be granted to this OAuth client",
		code: ErrCode.InsufficientScopes,
		statusCode: 403,
	});
};
