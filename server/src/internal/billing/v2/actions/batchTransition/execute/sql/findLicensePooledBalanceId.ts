import { pooledBalances } from "@autumn/shared";
import { and, asc, desc, eq, gt, isNull, or, sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { PooledAddIdentity } from "../../types/entitlementPriceOperationTypes";

export type LicensePooledBalanceMatch = {
	pooledBalanceId: string;
	isExactMatch: boolean;
};

/** Finds the live pool a license link holds for a feature. Link + feature is
 * the key; the other facets (anchor excluded) only rank candidates. */
export const findLicensePooledBalanceId = async ({
	db,
	identity,
	now,
}: {
	db: DrizzleCli;
	identity: PooledAddIdentity;
	now: number;
}): Promise<LicensePooledBalanceMatch | undefined> => {
	const facetsMatch = and(
		eq(pooledBalances.unlimited, identity.unlimited),
		eq(pooledBalances.interval, identity.interval),
		eq(pooledBalances.interval_count, identity.intervalCount),
		eq(pooledBalances.reset_mode, identity.resetMode),
		eq(pooledBalances.rollover_signature, identity.rolloverSignature),
	);
	const isExactMatch = sql<boolean>`COALESCE(${facetsMatch}, false)`;

	const [match] = await db
		.select({ pooledBalanceId: pooledBalances.id, isExactMatch })
		.from(pooledBalances)
		.where(
			and(
				eq(pooledBalances.internal_customer_id, identity.internalCustomerId),
				eq(
					pooledBalances.customer_license_link_id,
					identity.customerLicenseLinkId,
				),
				eq(pooledBalances.internal_feature_id, identity.internalFeatureId),
				or(
					isNull(pooledBalances.expires_at),
					gt(pooledBalances.expires_at, now),
				),
			),
		)
		.orderBy(
			desc(isExactMatch),
			desc(sql`${pooledBalances.expires_at} IS NULL`),
			desc(pooledBalances.granted),
			asc(pooledBalances.created_at),
		)
		.limit(1);

	return match;
};
