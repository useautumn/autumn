/**
 * TDD test for billing.update 500ing with
 * `duplicate key value violates unique constraint "unique_pooled_balance"`
 * (reported by mintlify, customer 67113cfc0aa7ee45f3866c1a).
 *
 * Root cause: addStripeSubscriptionIdToBillingPlan stamps the resolved Stripe
 * subscription id onto every pool in getChangedPooledBalances — inserts AND
 * updates AND expiry candidates. A pool belonging to a different subscription,
 * touched only to have its granted decremented on the way out, gets its
 * stripe_subscription_id rewritten. executePooledBalancePlan then writes that
 * identity in the same UPDATE that applies the granted delta, moving the row
 * onto an identity another live pool already holds.
 *
 * Red-failure mode (current behavior):
 *  - billing.update rejects with the duplicate key error above, thrown by the
 *    UPDATE on the outgoing pool.
 *
 * Green-success criteria (after fix):
 *  - the update succeeds and each pool keeps its own stripe_subscription_id.
 */

import { expect, test } from "bun:test";
import {
	customerEntitlements,
	pooledBalanceContributions,
	pooledBalances,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { getPooledBalanceDbState } from "../utils/getPooledBalanceDbState.js";

const GRANT = 100;
const UPDATED_GRANT = 250;

test(
	chalk.yellowBright(
		"pooled update: an outgoing pool on another subscription is not stamped with this subscription's id",
	),
	async () => {
		const customerId = "pooled-foreign-subscription-stamp";
		const FOREIGN_SUBSCRIPTION_ID = `sub_${customerId}_foreign`;
		const plan = products.pro({
			id: `${customerId}-plan`,
			items: [
				{ ...items.monthlyMessages({ includedUsage: GRANT }), pooled: true },
			],
		});

		const { entities, autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
				s.products({ list: [plan] }),
			],
			actions: [s.billing.attach({ productId: plan.id, entityIndex: 0 })],
		});

		const baseline = await getPooledBalanceDbState({ db: ctx.db, customerId });
		expect(baseline.pools).toHaveLength(1);
		expect(baseline.contributions).toHaveLength(1);
		const existingPool = baseline.pools[0];
		expect(existingPool.stripe_subscription_id).not.toBeNull();

		// ── Bad state, as seen in prod: the pool this plan contributes to belongs
		// to an older subscription, so the plan's own subscription no longer
		// matches the pool's identity.
		await ctx.db
			.update(pooledBalances)
			.set({ stripe_subscription_id: FOREIGN_SUBSCRIPTION_ID })
			.where(eq(pooledBalances.id, existingPool.id));

		// ── Act: a plan change that forces a Stripe subscription action, which is
		// the only path that runs addStripeSubscriptionIdToBillingPlan.
		await autumnV2_3.subscriptions.update({
			customer_id: customerId,
			product_id: plan.id,
			entity_id: entities[0].id,
			customize: {
				// The added priced item is what forces a Stripe subscription action;
				// pooled items are entitlement-only and never reach Stripe.
				items: [
					{
						...itemsV2.monthlyMessages({ included: UPDATED_GRANT }),
						pooled: true,
					},
					itemsV2.consumableWords({ amount: 2 }),
				],
			},
		});

		// ── Contract: the outgoing pool keeps the subscription it belongs to.
		const afterUpdate = await getPooledBalanceDbState({
			db: ctx.db,
			customerId,
		});
		const existingPoolAfter = afterUpdate.pools.find(
			(pool) => pool.id === existingPool.id,
		);
		expect(existingPoolAfter?.stripe_subscription_id).toBe(
			FOREIGN_SUBSCRIPTION_ID,
		);

		// ── Contract: no two live pools end up on the same identity.
		const liveSubscriptionIds = afterUpdate.pools
			.filter((pool) => pool.expires_at === null)
			.map((pool) => pool.stripe_subscription_id);
		expect(new Set(liveSubscriptionIds).size).toBe(liveSubscriptionIds.length);
	},
);
