import { oauthAccessToken } from "@autumn/shared";
import { and, eq, isNull } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

const deleteOAuthAccessTokensByClientAndReference = async ({
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

const deleteOAuthAccessTokensByConsentId = async ({
	db,
	consentId,
}: {
	db: DrizzleCli;
	consentId: string;
}) =>
	db
		.delete(oauthAccessToken)
		.where(eq(oauthAccessToken.oauthConsentId, consentId));

/** Null consent/resource leave the stored value alone; a grant is never blanked. */
const updateOAuthAccessTokenGrant = async ({
	db,
	id,
	oauthConsentId,
	referenceId,
	resource,
	scopes,
}: {
	db: Pick<DrizzleCli, "update">;
	id: string;
	oauthConsentId: string | null;
	referenceId?: string;
	resource: string | null;
	scopes: string[];
}) =>
	db
		.update(oauthAccessToken)
		.set({
			scopes,
			...(oauthConsentId ? { oauthConsentId } : {}),
			...(referenceId ? { referenceId } : {}),
			...(resource ? { resource } : {}),
		})
		.where(eq(oauthAccessToken.id, id));

export const oauthAccessTokenRepo = {
	deleteByClientAndReference: deleteOAuthAccessTokensByClientAndReference,
	deleteByConsentId: deleteOAuthAccessTokensByConsentId,
	updateGrant: updateOAuthAccessTokenGrant,
};
