import {
	AllowanceType,
	customerEntitlements,
	entitlements,
	pooledBalances,
} from "@autumn/shared";
import { and, eq, isNull } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { isUniqueConstraintError } from "@/db/dbUtils.js";
import { generateId } from "@/utils/genUtils.js";
import type {
	PooledAddIdentity,
	PooledAddSpec,
} from "../../types/entitlementPriceOperationTypes";

const findLivePooledBalanceId = async ({
	db,
	identity,
}: {
	db: DrizzleCli;
	identity: PooledAddIdentity;
}): Promise<string | undefined> => {
	const [existing] = await db
		.select({ id: pooledBalances.id })
		.from(pooledBalances)
		.where(
			and(
				eq(pooledBalances.internal_customer_id, identity.internalCustomerId),
				eq(pooledBalances.internal_feature_id, identity.internalFeatureId),
				eq(pooledBalances.unlimited, identity.unlimited),
				eq(pooledBalances.interval, identity.interval),
				eq(pooledBalances.interval_count, identity.intervalCount),
				identity.resetCycleAnchor === null
					? isNull(pooledBalances.reset_cycle_anchor)
					: eq(pooledBalances.reset_cycle_anchor, identity.resetCycleAnchor),
				eq(pooledBalances.reset_mode, identity.resetMode),
				isNull(pooledBalances.stripe_subscription_id),
				eq(
					pooledBalances.customer_license_link_id,
					identity.customerLicenseLinkId,
				),
				eq(pooledBalances.rollover_signature, identity.rolloverSignature),
				isNull(pooledBalances.expires_at),
			),
		)
		.limit(1);

	return existing?.id;
};

/** One synthetic cusEnt + custom entitlement + pool row for this identity. */
export const insertPooledBalanceGraph = async ({
	db,
	pooledAdd,
	customerId,
	orgId,
	env,
	now,
}: {
	db: DrizzleCli;
	pooledAdd: PooledAddSpec;
	customerId: string | null;
	orgId: string;
	env: string;
	now: number;
}): Promise<string> => {
	const existingId = await findLivePooledBalanceId({
		db,
		identity: pooledAdd.identity,
	});
	if (existingId) return existingId;

	const { identity, nextResetAt, featureId, rollover } = pooledAdd;
	const entitlementId = generateId("ent");
	const customerEntitlementId = generateId("cus_ent");
	const pooledBalanceId = generateId("pool");

	try {
		await db.insert(entitlements).values({
			id: entitlementId,
			created_at: now,
			internal_feature_id: identity.internalFeatureId,
			internal_product_id: null,
			internal_reward_id: null,
			is_custom: true,
			allowance_type: AllowanceType.Fixed,
			allowance: 0,
			interval: identity.interval,
			interval_count: identity.intervalCount,
			carry_from_previous: false,
			pooled: true,
			org_id: orgId,
			feature_id: featureId,
			rollover,
		});
		await db.insert(customerEntitlements).values({
			id: customerEntitlementId,
			customer_product_id: null,
			entitlement_id: entitlementId,
			internal_customer_id: identity.internalCustomerId,
			internal_entity_id: null,
			internal_feature_id: identity.internalFeatureId,
			unlimited: identity.unlimited,
			balance: 0,
			created_at: now,
			reset_cycle_anchor: identity.resetCycleAnchor,
			next_reset_at: nextResetAt,
			usage_allowed: false,
			separate_interval: false,
			adjustment: 0,
			additional_balance: 0,
			entities: null,
			expires_at: null,
			cache_version: 0,
			customer_id: customerId,
			feature_id: featureId,
			external_id: null,
			is_pooled_balance: true,
			pooled_balance_id: pooledBalanceId,
			reset_by_invoice: false,
		});
		await db.insert(pooledBalances).values({
			id: pooledBalanceId,
			org_id: orgId,
			env,
			internal_customer_id: identity.internalCustomerId,
			internal_feature_id: identity.internalFeatureId,
			unlimited: identity.unlimited,
			granted: 0,
			interval: identity.interval,
			interval_count: identity.intervalCount,
			reset_cycle_anchor: identity.resetCycleAnchor,
			reset_mode: identity.resetMode,
			stripe_subscription_id: null,
			customer_license_link_id: identity.customerLicenseLinkId,
			rollover_signature: identity.rolloverSignature,
			customer_entitlement_id: customerEntitlementId,
			last_applied_reset_at: null,
			expires_at: null,
			created_at: now,
			updated_at: now,
		});
		return pooledBalanceId;
	} catch (error) {
		if (!isUniqueConstraintError(error)) throw error;
		const racedId = await findLivePooledBalanceId({ db, identity });
		if (!racedId) throw error;
		return racedId;
	}
};
