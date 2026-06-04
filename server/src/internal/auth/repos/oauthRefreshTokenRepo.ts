import { oauthRefreshToken } from "@autumn/shared";
import { and, eq, isNull } from "drizzle-orm";
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

export const oauthRefreshTokenRepo = {
	deleteByClientAndReference: deleteOAuthRefreshTokensByClientAndReference,
};
