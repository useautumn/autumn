/** TDD contract: sync_v2 restores a pooled source and expire_previous replaces it. */
// Cancelling the sole contributor expires the pool, so sync-back mints a FRESH one.
// expire_previous then swaps the contribution in place, reusing that same pool.

import { expect, test } from "bun:test";
import {
	customerEntitlements,
	EntInterval,
	PooledBalanceResetMode,
	type SyncParamsV1,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { expectPooledBalanceCorrect } from "../utils/expectPooledBalanceCorrect";
import {
	getPooledBalanceDbState,
	getPooledSourceCustomerProduct,
} from "../utils/getPooledBalanceDbState";

const GRANT = 100;
const MONTHLY_POOL_LIFECYCLE = {
	interval: EntInterval.Month,
	nextResetAt: "present",
	resetCycleAnchor: "present",
	resetMode: PooledBalanceResetMode.Subscription,
	stripeSubscriptionId: "stripe_subscription",
} as const;

test(
	chalk.yellowBright(
		"pooled sync: sync-back inserts a source and expire_previous replaces it",
	),
	async () => {
		const customerId = "pooled-sync-back-replacement";
		const plan = products.pro({
			id: "pooled-sync-back-plan",
			items: [
				{
					...items.monthlyMessages({ includedUsage: GRANT }),
					pooled: true,
				},
			],
		});
		const { autumnV1, autumnV2_2, ctx, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
				s.products({ list: [plan] }),
			],
			actions: [s.billing.attach({ productId: plan.id, entityIndex: 0 })],
		});

		const initialState = await expectPooledBalanceCorrect({
			db: ctx.db,
			customerId,
			pool: {
				balance: GRANT,
				adjustment: 0,
				granted: GRANT,
				...MONTHLY_POOL_LIFECYCLE,
			},
			contributions: {
				count: 1,
				currentContribution: GRANT,
				nextCycleContribution: GRANT,
			},
			sources: { count: 1, balance: 0, adjustment: 0 },
		});
		const initialSource = getPooledSourceCustomerProduct({
			state: initialState,
			productId: plan.id,
			entityId: entities[0].id,
		});
		const initialContribution = initialState.contributions[0];
		if (!initialContribution) {
			throw new Error("Expected the initial pooled contribution");
		}
		const initialPoolId = initialState.pools[0].id;
		const stripeSubscriptionId = initialSource.subscription_ids?.[0];
		if (!stripeSubscriptionId) {
			throw new Error("Expected the pooled source to have a subscription");
		}

		await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			customer_product_id: initialSource.id,
			entity_id: entities[0].id,
			cancel_action: "cancel_immediately",
			no_billing_changes: true,
		});

		// Cancelling the only contributor expires the pool: the row survives for
		// audit, but nothing live is left behind.
		const afterCancel = await getPooledBalanceDbState({
			db: ctx.db,
			customerId,
		});
		expect(afterCancel.contributions).toHaveLength(0);
		expect(afterCancel.pools).toHaveLength(1);
		expect(afterCancel.pools[0].id).toBe(initialPoolId);
		expect(afterCancel.pools[0].expires_at).not.toBeNull();
		expect(afterCancel.poolCustomerEntitlements[0].expires_at).not.toBeNull();

		const canceledSource = await ctx.db.query.customerEntitlements.findFirst({
			where: eq(
				customerEntitlements.id,
				initialContribution.source_customer_entitlement_id,
			),
		});
		expect(canceledSource?.pooled_contribution_id).toBeNull();

		const syncParams = {
			customer_id: customerId,
			stripe_subscription_id: stripeSubscriptionId,
			phases: [
				{
					starts_at: "now",
					plans: [
						{
							plan_id: plan.id,
							entity_id: entities[0].id,
						},
					],
				},
			],
		} satisfies SyncParamsV1;
		await autumnV1.post("/billing.sync_v2", syncParams);

		const syncedState = await expectPooledBalanceCorrect({
			db: ctx.db,
			customerId,
			pool: {
				balance: GRANT,
				adjustment: 0,
				granted: GRANT,
				...MONTHLY_POOL_LIFECYCLE,
			},
			contributions: {
				count: 1,
				currentContribution: GRANT,
				nextCycleContribution: GRANT,
				excludedSourceCustomerProductIds: [initialSource.id],
			},
			sources: { count: 2, balance: 0, adjustment: 0 },
		});
		// The expired pool freed its identity slot, so sync-back mints a new one.
		const syncedPoolId = syncedState.pools[0].id;
		expect(syncedPoolId).not.toBe(initialPoolId);

		const syncedSourceId =
			syncedState.contributions[0]?.source_customer_product_id;
		const syncedSourceEntitlementId =
			syncedState.contributions[0]?.source_customer_entitlement_id;
		expect(syncedSourceId).toBeDefined();
		expect(syncedSourceEntitlementId).toBeDefined();
		expect(syncedSourceId).not.toBe(initialSource.id);
		const syncedSourceEntitlement =
			await ctx.db.query.customerEntitlements.findFirst({
				where: eq(customerEntitlements.id, syncedSourceEntitlementId!),
			});
		expect(syncedSourceEntitlement?.pooled_contribution_id).toBe(
			syncedState.contributions[0]?.id,
		);

		await autumnV1.post("/billing.sync_v2", {
			...syncParams,
			phases: [
				{
					starts_at: "now",
					plans: [
						{
							plan_id: plan.id,
							entity_id: entities[0].id,
							expire_previous: true,
						},
					],
				},
			],
		} satisfies SyncParamsV1);

		const replacedState = await expectPooledBalanceCorrect({
			db: ctx.db,
			customerId,
			pool: {
				balance: GRANT,
				adjustment: 0,
				granted: GRANT,
				...MONTHLY_POOL_LIFECYCLE,
			},
			contributions: {
				count: 1,
				currentContribution: GRANT,
				nextCycleContribution: GRANT,
				excludedSourceCustomerProductIds: [initialSource.id, syncedSourceId!],
			},
			sources: { count: 3, balance: 0, adjustment: 0 },
		});
		// Swapping the contribution never drops it to zero, so the pool is reused.
		expect(replacedState.pools[0].id).toBe(syncedPoolId);

		const replacementSourceId =
			replacedState.contributions[0]?.source_customer_product_id;
		const replacementSourceEntitlementId =
			replacedState.contributions[0]?.source_customer_entitlement_id;
		expect(replacementSourceId).toBeDefined();
		expect(replacementSourceEntitlementId).toBeDefined();
		expect(replacementSourceId).not.toBe(syncedSourceId);
		const [expiredSyncedSource, replacementSource] = await Promise.all([
			ctx.db.query.customerEntitlements.findFirst({
				where: eq(customerEntitlements.id, syncedSourceEntitlementId!),
			}),
			ctx.db.query.customerEntitlements.findFirst({
				where: eq(customerEntitlements.id, replacementSourceEntitlementId!),
			}),
		]);
		expect(expiredSyncedSource?.pooled_contribution_id).toBeNull();
		expect(replacementSource?.pooled_contribution_id).toBe(
			replacedState.contributions[0]?.id,
		);
	},
);
