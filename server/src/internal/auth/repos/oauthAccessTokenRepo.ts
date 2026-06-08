import { oauthAccessToken } from "@autumn/shared";
import { and, eq, gt, inArray, isNull } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";

export const getValidOAuthAccessTokenByTokenValues = async ({
	db,
	tokenValues,
}: {
	db: DrizzleCli;
	tokenValues: string[];
}) => {
	const [token] = await db
		.select()
		.from(oauthAccessToken)
		.where(
			and(
				inArray(oauthAccessToken.token, tokenValues),
				gt(oauthAccessToken.expiresAt, new Date()),
			),
		)
		.limit(1);

	return token ?? null;
};

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

export const oauthAccessTokenRepo = {
	getValidByTokenValues: getValidOAuthAccessTokenByTokenValues,
	deleteByClientAndReference: deleteOAuthAccessTokensByClientAndReference,
};
