import { oauthAccessToken } from "@autumn/shared";
import { findActiveOAuthAccessToken } from "@autumn/shared/utils/auth/oauthAccessTokens";
import { and, eq, isNull } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

/** Shares the hash + expiry lookup Leaf's MCP transport authenticates bearers with. */
export const getValidOAuthAccessTokenByRawToken = async ({
	db,
	rawAccessToken,
}: {
	db: DrizzleCli;
	rawAccessToken: string;
}) => (await findActiveOAuthAccessToken({ db, rawAccessToken })) ?? null;

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
	getValidByRawToken: getValidOAuthAccessTokenByRawToken,
	deleteByClientAndReference: deleteOAuthAccessTokensByClientAndReference,
	updateGrant: updateOAuthAccessTokenGrant,
};
