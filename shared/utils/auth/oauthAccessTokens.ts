import { createHash } from "node:crypto";
import { and, gt, inArray } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { oauthAccessToken } from "../../db/auth-schema";
import type * as schema from "../../db/schema";
import { deduplicateArray } from "../utils";

export type OAuthAccessTokenDb = Pick<
	PgDatabase<PgQueryResultHKT, typeof schema>,
	"query"
>;

/** Must stay byte-identical to better-auth's default hashing, or lookups miss. */
export const hashOAuthToken = (token: string): string =>
	createHash("sha256").update(token).digest("base64url");

export const getOAuthTokenValues = (rawToken: string) =>
	deduplicateArray([hashOAuthToken(rawToken), rawToken]);

export async function findActiveOAuthAccessToken({
	db,
	rawAccessToken,
}: {
	db: OAuthAccessTokenDb;
	rawAccessToken: string;
}) {
	return db.query.oauthAccessToken.findFirst({
		where: and(
			inArray(oauthAccessToken.token, getOAuthTokenValues(rawAccessToken)),
			gt(oauthAccessToken.expiresAt, new Date()),
		),
	});
}
