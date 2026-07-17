/**
 * Direct customer deletion must not orphan the synthetic rows owned by a pooled balance.
 */

import { expect, test } from "bun:test";
import {
	AllowanceType,
	customerEntitlements,
	EntInterval,
	entitlements,
	PooledBalanceResetMode,
	pooledBalances,
} from "@autumn/shared";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { eq } from "drizzle-orm";
import { pooledBalanceRepo } from "@/internal/billing/v2/pooledBalances/repos/pooledBalanceRepo.js";
import { CusService } from "@/internal/customers/CusService.js";
import { cleanupFullSubjectScenario } from "../full-subject/utils/cleanupFullSubjectScenario.js";
import { buildCustomerMeteredScenario } from "../full-subject/utils/fullSubjectScenarioBuilders.js";
import { insertFullSubjectScenario } from "../full-subject/utils/insertFullSubjectScenario.js";

test("deleteByInternalId removes a pooled balance's synthetic entitlement graph", async () => {
	const scenario = buildCustomerMeteredScenario({
		ctx,
		name: "pooled-direct-customer-delete",
	});
	const sourceEntitlement = scenario.entitlements[0]!;
	const now = Date.now();
	const syntheticEntitlementId = `ent_pool_${scenario.ids.internalCustomerId}`;
	const syntheticCustomerEntitlementId = `cus_ent_pool_${scenario.ids.internalCustomerId}`;
	const pooledBalanceId = `pool_${scenario.ids.internalCustomerId}`;

	await insertFullSubjectScenario({ ctx, scenario });
	try {
		await pooledBalanceRepo.insertPoolGraph({
			db: ctx.db,
			entitlement: {
				id: syntheticEntitlementId,
				created_at: now,
				internal_feature_id: sourceEntitlement.internal_feature_id,
				internal_product_id: null,
				internal_reward_id: null,
				is_custom: true,
				allowance_type: AllowanceType.Fixed,
				allowance: 0,
				interval: EntInterval.Month,
				interval_count: 1,
				carry_from_previous: false,
				entity_feature_id: null,
				pooled: true,
				org_id: ctx.org.id,
				feature_id: sourceEntitlement.feature_id,
				usage_limit: null,
				expiry_duration: null,
				expiry_length: null,
				rollover: null,
			},
			customerEntitlement: {
				id: syntheticCustomerEntitlementId,
				customer_product_id: null,
				entitlement_id: syntheticEntitlementId,
				internal_customer_id: scenario.ids.internalCustomerId,
				internal_entity_id: null,
				internal_feature_id: sourceEntitlement.internal_feature_id,
				unlimited: false,
				balance: 100,
				created_at: now,
				reset_cycle_anchor: null,
				next_reset_at: now + 30 * 24 * 60 * 60 * 1000,
				usage_allowed: false,
				separate_interval: false,
				adjustment: 0,
				additional_balance: 0,
				entities: null,
				expires_at: null,
				cache_version: 0,
				customer_id: scenario.ids.customerId,
				feature_id: sourceEntitlement.feature_id,
				external_id: null,
				expired: false,
			},
			pool: {
				id: pooledBalanceId,
				org_id: ctx.org.id,
				env: ctx.env,
				internal_customer_id: scenario.ids.internalCustomerId,
				internal_feature_id: sourceEntitlement.internal_feature_id,
				interval: EntInterval.Month,
				interval_count: 1,
				reset_cycle_anchor: null,
				reset_mode: PooledBalanceResetMode.Lazy,
				rollover_signature: "none",
				price_id: null,
				entitlement_id: syntheticEntitlementId,
				customer_entitlement_id: syntheticCustomerEntitlementId,
				last_applied_reset_at: null,
				created_at: now,
				updated_at: now,
			},
		});

		await CusService.deleteByInternalId({
			db: ctx.db,
			internalId: scenario.ids.internalCustomerId,
			orgId: ctx.org.id,
			env: ctx.env,
		});

		const [syntheticEntitlement, syntheticCustomerEntitlement, pooledBalance] =
			await Promise.all([
				ctx.db
					.select({ id: entitlements.id })
					.from(entitlements)
					.where(eq(entitlements.id, syntheticEntitlementId)),
				ctx.db
					.select({ id: customerEntitlements.id })
					.from(customerEntitlements)
					.where(eq(customerEntitlements.id, syntheticCustomerEntitlementId)),
				ctx.db
					.select({ id: pooledBalances.id })
					.from(pooledBalances)
					.where(eq(pooledBalances.id, pooledBalanceId)),
			]);

		expect(syntheticEntitlement).toEqual([]);
		expect(syntheticCustomerEntitlement).toEqual([]);
		expect(pooledBalance).toEqual([]);
	} finally {
		await ctx.db
			.delete(pooledBalances)
			.where(eq(pooledBalances.id, pooledBalanceId));
		await ctx.db
			.delete(customerEntitlements)
			.where(eq(customerEntitlements.id, syntheticCustomerEntitlementId));
		await ctx.db
			.delete(entitlements)
			.where(eq(entitlements.id, syntheticEntitlementId));
		await cleanupFullSubjectScenario({ ctx, scenario });
	}
});
