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
		oauthConsentId?: string | null;
	};
};

const getTokenConsentId = ({
	oauthConsentId,
}: {
	oauthConsentId?: string | null;
}) => {
	if (oauthConsentId) return oauthConsentId;

	throw new RecaseError({
		message: "OAuth token is missing a consent",
		code: ErrCode.InvalidRequest,
		statusCode: 401,
	});
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
	requestedScopes: string[] | null;
}) => {
	const isAtmnClient = await isAtmnOAuthClientId({
		db,
		clientId: tokenRecord.clientId,
	});
	if (isAtmnClient) return null;

	const oauthConsentId = getTokenConsentId({
		oauthConsentId: tokenRecord.oauthConsentId,
	});
	const consent = await oauthConsentRepo.getApiKeyRecord({
		db,
		consentId: oauthConsentId,
	});

	if (!consent) {
		throw new RecaseError({
			message: "OAuth consent not found",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	if (consent.env !== AppEnv.Live && consent.env !== AppEnv.Sandbox) {
		throw new RecaseError({
			message: "OAuth consent is missing an environment",
			code: ErrCode.InvalidRequest,
			statusCode: 401,
		});
	}

	const scopes = requestedScopes ?? tokenRecord.scopes;
	const apiKey = await rotateOAuthConsentApiKey({
		db,
		consent,
		tokenRecord,
		env: consent.env,
		scopes,
	});

	return {
		apiKey,
		env: consent.env,
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
