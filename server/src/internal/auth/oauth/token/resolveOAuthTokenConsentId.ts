import type { DrizzleCli } from "@/db/initDrizzle.js";
import { oauthConsentRepo } from "../../repos/index.js";
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
	if (consents.length !== 1) return null;

	return consents[0]?.id ?? null;
};

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
