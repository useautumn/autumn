import {
	ATMN_APP_KEY_SCOPES,
	ErrCode,
	isScopeSubset,
	isValidScope,
	RecaseError,
	type ScopeString,
} from "@autumn/shared";
import { getScopesForUserInOrg } from "@autumn/shared/utils/auth/getScopesForUserInOrg";
import { z } from "zod/v4";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { isAtmnOAuthClientId } from "@/internal/auth/oauth/atmnOAuthClients.js";

export type OAuthApiKeyRequestBody = {
	resource?: unknown;
	scopes?: unknown;
};

export type ResourceAccessTokenRecord = {
	id?: string;
	refreshId?: string | null;
	userId: string | null;
	referenceId: string | null;
	clientId: string;
	oauthConsentId?: string | null;
	scopes: string[];
};

const ScopeStringSchema = z.custom<ScopeString>(
	(scope) => typeof scope === "string" && isValidScope(scope),
	{ message: "Invalid scope" },
);
const RequestedScopesSchema = z.array(ScopeStringSchema).optional();
export const OAuthApiKeyRequestBodySchema = z
	.object({
		resource: z.unknown().optional(),
		scopes: z.unknown().optional(),
	})
	.strict();

export const parseRequestedScopes = (scopes: unknown) => {
	const parsed = RequestedScopesSchema.safeParse(scopes);
	if (parsed.success) return parsed.data ?? null;

	throw new RecaseError({
		message: "Invalid scopes",
		code: ErrCode.InvalidRequest,
		statusCode: 400,
	});
};

const getStringClaim = (payload: Record<string, unknown>, key: string) =>
	typeof payload[key] === "string" ? payload[key] : null;

export const tokenRecordFromResourceToken = (
	payload: Record<string, unknown>,
): ResourceAccessTokenRecord => {
	const scope = getStringClaim(payload, "scope");

	return {
		userId: getStringClaim(payload, "sub"),
		referenceId: getStringClaim(payload, "reference_id"),
		clientId:
			getStringClaim(payload, "azp") ??
			getStringClaim(payload, "client_id") ??
			"",
		scopes: scope ? scope.split(" ") : [],
	};
};

/** Grants atmn keys the app scopes, capped by the user's org role, so older CLIs get them.
 * Explicitly requested scopes are minted as-is, with no grant. */
export const withAtmnAppKeyScopes = async ({
	db,
	clientId,
	userId,
	orgId,
	apiKeyScopes,
	requestedScopes,
}: {
	db: DrizzleCli;
	clientId: string;
	userId: string;
	orgId: string;
	apiKeyScopes: string[];
	requestedScopes: string[] | null;
}): Promise<string[]> => {
	if (requestedScopes) return apiKeyScopes;
	if (!(await isAtmnOAuthClientId({ db, clientId }))) return apiKeyScopes;

	const { scopes: roleScopes } = await getScopesForUserInOrg({
		db,
		userId,
		organizationId: orgId,
	});
	const grantedAppScopes = ATMN_APP_KEY_SCOPES.filter((scope) =>
		isScopeSubset([scope], roleScopes),
	);

	return [...new Set([...apiKeyScopes, ...grantedAppScopes])];
};
