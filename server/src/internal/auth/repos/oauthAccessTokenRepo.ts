import { oauthAccessToken } from "@autumn/shared";
import { and, eq, isNull } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

export const deleteOAuthAccessTokensByClientAndReference = async ({
	db,
	clientId,
	referenceId,
}: {
	db: DrizzleCli;
	clientId: string;
	referenceId: string | null;
}) =>
	db
		.delete(oauthAccessToken)
		.where(
			and(
				eq(oauthAccessToken.clientId, clientId),
				referenceId
					? eq(oauthAccessToken.referenceId, referenceId)
					: isNull(oauthAccessToken.referenceId),
			),
		);

/** Null consent/resource leave the stored value alone; a grant is never blanked. */
export const updateOAuthAccessTokenGrant = async ({
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
		.update(oauthAccessToken)
		.set({
			scopes,
			...(oauthConsentId ? { oauthConsentId } : {}),
			...(resource ? { resource } : {}),
		})
		.where(eq(oauthAccessToken.id, id));

export const oauthAccessTokenRepo = {
	deleteByClientAndReference: deleteOAuthAccessTokensByClientAndReference,
	updateGrant: updateOAuthAccessTokenGrant,
};
