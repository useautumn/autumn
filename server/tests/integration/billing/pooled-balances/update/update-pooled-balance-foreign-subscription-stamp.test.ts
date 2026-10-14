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

		await ctx.db
			.update(pooledBalances)
			.set({ stripe_subscription_id: FOREIGN_SUBSCRIPTION_ID })
			.where(eq(pooledBalances.id, existingPool.id));

		await autumnV2_3.subscriptions.update({
			customer_id: customerId,
			product_id: plan.id,
			entity_id: entities[0].id,
			customize: {
				items: [
					{
						...itemsV2.monthlyMessages({ included: UPDATED_GRANT }),
						pooled: true,
					},
					itemsV2.consumableWords({ amount: 2 }),
				],
			},
		});

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

		const liveSubscriptionIds = afterUpdate.pools
			.filter((pool) => pool.expires_at === null)
			.map((pool) => pool.stripe_subscription_id);
		expect(new Set(liveSubscriptionIds).size).toBe(liveSubscriptionIds.length);
	},
);
