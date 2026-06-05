import { stripOAuthTokenPrefix } from "@autumn/auth";
import {
	AppEnv,
	checkScopes,
	ErrCode,
	RecaseError,
	type ScopeString,
} from "@autumn/shared";
import { verifyAccessToken } from "better-auth/oauth2";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import {
	parseRequestedScopes,
	type ResourceAccessTokenRecord,
	tokenRecordFromResourceToken,
} from "@/internal/dev/cli/oauthApiKeyUtils.js";
import { hashOAuthToken } from "@/utils/oauthUtils.js";
import { oauthAccessTokenRepo, oauthConsentRepo } from "../repos/index.js";
import { isAtmnOAuthClientId } from "./atmnOAuthClients.js";
import { rotateOAuthConsentApiKey } from "./oauthConsentApiKey.js";

const getOAuthIssuer = () =>
	`${process.env.BETTER_AUTH_URL?.replace(/\/$/, "") ?? ""}/api/auth`;

const verifyResourceAccessToken = async ({
	accessToken,
	resource,
	requestedScopes,
}: {
	accessToken: string;
	resource: string | null;
	requestedScopes: ScopeString[] | null;
}) => {
	if (!resource) return null;

	const issuer = getOAuthIssuer();
	try {
		const payload = await verifyAccessToken(accessToken, {
			jwksUrl: `${issuer}/jwks`,
			verifyOptions: {
				audience: resource,
				issuer,
			},
			scopes: requestedScopes ?? undefined,
		});

		return tokenRecordFromResourceToken(payload as Record<string, unknown>);
	} catch {
		return null;
	}
};

export const getOAuthAccessTokenRecord = async ({
	db,
	accessToken,
	resource,
	requestedScopes,
}: {
	db: DrizzleCli;
	accessToken: string;
	resource: string | null;
	requestedScopes: ScopeString[] | null;
}) => {
	const rawAccessToken = stripOAuthTokenPrefix({ token: accessToken });
	const hashedToken = await hashOAuthToken(rawAccessToken);
	const tokenValues = [...new Set([hashedToken, rawAccessToken])];
	const tokenRecord =
		(await oauthAccessTokenRepo.getValidByTokenValues({ db, tokenValues })) ??
		(await verifyResourceAccessToken({
			accessToken: rawAccessToken,
			resource,
			requestedScopes,
		}));

	if (!tokenRecord) {
		throw new RecaseError({
			message: "Invalid or expired access token",
			code: ErrCode.InvalidRequest,
			statusCode: 401,
		});
	}

	if (requestedScopes) {
		const { allowed, missing } = checkScopes(
			requestedScopes,
			tokenRecord.scopes,
		);
		if (!allowed) {
			throw new RecaseError({
				message: `Insufficient scopes. Missing: ${missing.join(", ")}`,
				code: ErrCode.InsufficientScopes,
				statusCode: 403,
			});
		}
	}

	const userId = tokenRecord.userId;
	if (!userId) {
		throw new RecaseError({
			message: "Token missing user information",
			code: ErrCode.InvalidRequest,
			statusCode: 401,
		});
	}

	const orgId = tokenRecord.referenceId;
	if (!orgId) {
		throw new RecaseError({
			message: "No organization found. Please select an organization.",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	return tokenRecord as ResourceAccessTokenRecord & {
		userId: string;
		referenceId: string;
	};
};

export const getExternalOAuthApiKeyForToken = async ({
	db,
	tokenRecord,
	requestedScopes,
}: {
	db: DrizzleCli;
	tokenRecord: ResourceAccessTokenRecord & {
		userId: string;
		referenceId: string;
	};
	requestedScopes: ScopeString[] | null;
}) => {
	const isAtmnClient = await isAtmnOAuthClientId({
		db,
		clientId: tokenRecord.clientId,
	});
	if (isAtmnClient) return null;

	const consent = await oauthConsentRepo.getForClientUserOrg({
		db,
		clientId: tokenRecord.clientId,
		userId: tokenRecord.userId,
		referenceId: tokenRecord.referenceId,
	});

	if (!consent) {
		throw new RecaseError({
			message: "OAuth consent not found",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	const env = consent.env ?? AppEnv.Sandbox;
	const scopes = requestedScopes ?? (tokenRecord.scopes as ScopeString[]);
	const apiKey = await rotateOAuthConsentApiKey({
		db,
		consent,
		tokenRecord,
		env,
		scopes,
	});

	return {
		apiKey,
		env,
		orgId: tokenRecord.referenceId,
		userId: tokenRecord.userId,
		clientId: tokenRecord.clientId,
		scopes,
	};
};

export const scopesFromOAuthScopeString = (scope: unknown) => {
	if (typeof scope !== "string") return null;
	return parseRequestedScopes(scope.split(/\s+/).filter(Boolean));
};
