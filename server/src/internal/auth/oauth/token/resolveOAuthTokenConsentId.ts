import type { DrizzleCli } from "@/db/initDrizzle.js";
import { oauthConsentRepo } from "../../repos/oauthConsentRepo.js";
import type { OAuthAccessTokenRecord } from "../oauthAccessTokenApiKey.js";

const getUniqueOAuthConsentId = async ({
	clientId,
	db,
	referenceId,
	userId,
}: {
	clientId: string;
	db: DrizzleCli;
	referenceId: string;
	userId: string;
}) => {
	const consents = await oauthConsentRepo.listForClientUserOrg({
		db,
		clientId,
		referenceId,
		userId,
	});
	const [consent] = consents;

	return consents.length === 1 && consent ? consent.id : null;
};

/**
 * Prefers the consent already on the token, then the one carried by the refresh
 * token it rotated from, and only then the single unambiguous consent on file.
 */
export const resolveOAuthTokenConsentId = async ({
	db,
	refreshTokenRecord,
	tokenRecord,
}: {
	db: DrizzleCli;
	refreshTokenRecord: { oauthConsentId: string | null } | null;
	tokenRecord: OAuthAccessTokenRecord;
}) =>
	tokenRecord.oauthConsentId ??
	refreshTokenRecord?.oauthConsentId ??
	(await getUniqueOAuthConsentId({
		clientId: tokenRecord.clientId,
		db,
		referenceId: tokenRecord.referenceId,
		userId: tokenRecord.userId,
	}));
