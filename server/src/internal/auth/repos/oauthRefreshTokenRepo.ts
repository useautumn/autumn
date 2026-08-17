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

/** Null consent/resource leave the stored value alone; a grant is never blanked. */
export const updateOAuthRefreshTokenGrant = async ({
	db,
	id,
	oauthConsentId,
	resource,
	scopes,
}: {
	db: Pick<DrizzleCli, "update">;
	id: string;
	oauthConsentId: string | null;
	resource: string | null;
	scopes: string[];
}) =>
	db
		.update(oauthRefreshToken)
		.set({
			scopes,
			...(oauthConsentId ? { oauthConsentId } : {}),
			...(resource ? { resource } : {}),
		})
		.where(eq(oauthRefreshToken.id, id));

export const oauthRefreshTokenRepo = {
	deleteByClientAndReference: deleteOAuthRefreshTokensByClientAndReference,
	getByTokenValues: getOAuthRefreshTokenByTokenValues,
	updateGrant: updateOAuthRefreshTokenGrant,
};
