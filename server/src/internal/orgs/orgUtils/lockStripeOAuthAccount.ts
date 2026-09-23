import type { AppEnv } from "@autumn/shared";
import { type SQL, sql } from "drizzle-orm";

/** Serializes every write that binds or revokes one OAuth account in one environment. */
export const lockStripeOAuthAccount = async ({
	tx,
	env,
	accountId,
}: {
	tx: { execute: (query: SQL) => PromiseLike<unknown> };
	env: AppEnv;
	accountId: string;
}) => {
	await tx.execute(
		sql`SELECT pg_advisory_xact_lock(hashtextextended(${`stripe-oauth:${env}:${accountId}`}, 0))`,
	);
};
