import { createHash } from "node:crypto";
import { and, gt, inArray } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { oauthAccessToken } from "../../db/auth-schema";
import type * as schema from "../../db/schema";

/** Any drizzle db over the shared schema; server's instrumented db overrides `execute`. */
export type OAuthAccessTokenDb = Pick<
	PgDatabase<PgQueryResultHKT, typeof schema>,
	"query"
>;

/**
 * Hash an OAuth token with SHA-256 + base64url encoding, matching
 * better-auth's default token hashing method.
 */
export async function hashOAuthToken(token: string): Promise<string> {
	return createHash("sha256").update(token).digest("base64url");
}

/**
 * Values to match against the stored `oauth_access_token.token` column:
 * the base64url SHA-256 hash, plus the raw value for legacy unhashed rows.
 */
export const getOAuthAccessTokenValues = async (rawAccessToken: string) => [
	...new Set([await hashOAuthToken(rawAccessToken), rawAccessToken]),
];

/**
 * Looks up an unexpired OAuth access token by its raw (prefix-stripped)
 * value, using the same match predicate as the api server's OAuth
 * middleware. Returns undefined for unknown or expired tokens.
 */
export async function findActiveOAuthAccessToken({
	db,
	rawAccessToken,
}: {
	db: OAuthAccessTokenDb;
	rawAccessToken: string;
}) {
	return db.query.oauthAccessToken.findFirst({
		where: and(
			inArray(
				oauthAccessToken.token,
				await getOAuthAccessTokenValues(rawAccessToken),
			),
			gt(oauthAccessToken.expiresAt, new Date()),
		),
	});
}
