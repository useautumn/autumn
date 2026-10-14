import { expect, test } from "bun:test";
import type { CreateScheduleParamsV0Input } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { getPooledBalanceDbState } from "../utils/getPooledBalanceDbState.js";

const FREE_GRANT = 50;
const PRO_GRANT = 100;

const pooledItem = ({ grant }: { grant: number }) => ({
	...items.monthlyMessages({ includedUsage: grant }),
	pooled: true,
});

test(
	chalk.yellowBright(
		"pooled createSchedule: free and paid pooled plans form two pools, added entity sources join by identity",
	),
	async () => {
		const customerId = "pooled-schedule-identities";
		const freePlan = products.base({
			id: "pooled-schedule-free",
			group: "pooled-schedule-free-group",
			items: [pooledItem({ grant: FREE_GRANT })],
		});
		const proPlan = products.pro({
			id: "pooled-schedule-pro",
			group: "pooled-schedule-pro-group",
			items: [pooledItem({ grant: PRO_GRANT })],
		});

		const { entities, autumnV1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
				s.products({ list: [freePlan, proPlan] }),
			],
			actions: [],
		});

		const customerLevelParams: CreateScheduleParamsV0Input = {
			customer_id: customerId,
			phases: [
				{
					starts_at: "now",
					plans: [{ plan_id: freePlan.id }, { plan_id: proPlan.id }],
				},
			],
		};
		await autumnV1.billing.createSchedule(customerLevelParams);

		const afterCustomerLevel = await getPooledBalanceDbState({
			db: ctx.db,
			customerId,
		});
		expect(afterCustomerLevel.pools).toHaveLength(2);
		expect(afterCustomerLevel.contributions).toHaveLength(2);

		const lazyPool = afterCustomerLevel.pools.find(
			(pool) => pool.stripe_subscription_id === null,
		);
		const subscriptionPool = afterCustomerLevel.pools.find(
			(pool) => pool.stripe_subscription_id !== null,
		);
		if (!(lazyPool && subscriptionPool)) {
			throw new Error("expected one lazy pool and one subscription pool");
		}
		expect(lazyPool.granted).toBe(FREE_GRANT);
		expect(subscriptionPool.granted).toBe(PRO_GRANT);

		const entityLevelParams: CreateScheduleParamsV0Input = {
			customer_id: customerId,
			phases: [
				{
					starts_at: "now",
					plans: [
						{ plan_id: freePlan.id },
						{ plan_id: proPlan.id },
						{ plan_id: freePlan.id, entity_id: entities[0].id },
						{ plan_id: proPlan.id, entity_id: entities[0].id },
					],
				},
			],
		};
		await autumnV1.billing.createSchedule(entityLevelParams);

		const afterEntityLevel = await getPooledBalanceDbState({
			db: ctx.db,
			customerId,
		});
		expect(afterEntityLevel.contributions).toHaveLength(4);
		expect(afterEntityLevel.pools).toHaveLength(2);

		const lazyPoolAfter = afterEntityLevel.pools.find(
			(pool) => pool.id === lazyPool.id,
		);
		const subscriptionPoolAfter = afterEntityLevel.pools.find(
			(pool) => pool.id === subscriptionPool.id,
		);
		expect(lazyPoolAfter?.granted).toBe(FREE_GRANT * 2);
		expect(subscriptionPoolAfter?.granted).toBe(PRO_GRANT * 2);

		const contributionsByPool = new Map<string, number>();
		for (const contribution of afterEntityLevel.contributions) {
			contributionsByPool.set(
				contribution.pooled_balance_id,
				(contributionsByPool.get(contribution.pooled_balance_id) ?? 0) + 1,
			);
		}
		expect(contributionsByPool.get(lazyPool.id)).toBe(2);

		for (const pool of afterEntityLevel.pools) {
			const fed = afterEntityLevel.contributions
				.filter((contribution) => contribution.pooled_balance_id === pool.id)
				.reduce(
					(total, contribution) => total + contribution.current_contribution,
					0,
				);
			expect(pool.granted).toBe(fed);
		}
	},
);
