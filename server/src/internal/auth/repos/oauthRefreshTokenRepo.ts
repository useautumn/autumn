import { oauthRefreshToken } from "@autumn/shared";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

export const deleteOAuthRefreshTokensByClientAndReference = async ({
	db,
	clientId,
	referenceId,
}: {
	db: DrizzleCli;
	clientId: string;
	referenceId: string | null;
}) =>
	db
		.delete(oauthRefreshToken)
		.where(
			and(
				eq(oauthRefreshToken.clientId, clientId),
				referenceId
					? eq(oauthRefreshToken.referenceId, referenceId)
					: isNull(oauthRefreshToken.referenceId),
			),
		);

export const updateOAuthRefreshTokenScopes = async ({
	db,
	id,
	scopes,
}: {
	db: DrizzleCli;
	id: string;
	scopes: string[];
}) =>
	db
		.update(oauthRefreshToken)
		.set({ scopes })
		.where(eq(oauthRefreshToken.id, id));

export const getOAuthRefreshTokenByTokenValues = async ({
	db,
	tokenValues,
}: {
	db: DrizzleCli;
	tokenValues: string[];
}) => {
	const [token] = await db
		.select()
		.from(oauthRefreshToken)
		.where(inArray(oauthRefreshToken.token, tokenValues))
		.limit(1);

	return token ?? null;
};

export const updateOAuthRefreshTokenConsent = async ({
	db,
	id,
	oauthConsentId,
}: {
	db: DrizzleCli;
	id: string;
	oauthConsentId: string;
}) =>
	db
		.update(oauthRefreshToken)
		.set({ oauthConsentId })
		.where(eq(oauthRefreshToken.id, id));

export const oauthRefreshTokenRepo = {
	deleteByClientAndReference: deleteOAuthRefreshTokensByClientAndReference,
	updateScopes: updateOAuthRefreshTokenScopes,
	getByTokenValues: getOAuthRefreshTokenByTokenValues,
	updateConsent: updateOAuthRefreshTokenConsent,
};
