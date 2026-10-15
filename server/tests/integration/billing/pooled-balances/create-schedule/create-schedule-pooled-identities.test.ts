/**
 * Pool identity across createSchedule.
 *
 * Contract under test:
 *   - One createSchedule phase carrying a FREE pooled plan and a PAID recurring
 *     pooled plan with the same feature and cycle produces ONE subscription pool:
 *     the free source joins the paid plan's pool instead of opening a lazy one.
 *   - Re-declaring those plans alongside entity-scoped copies routes every
 *     contribution to that pool rather than minting new pools per source.
 *   Side effects:
 *     - pooled_balances: one row, granted summed across every source
 *     - pooled_balance_contributions: one row per contributing source
 *
 * A schedule is customer-level: a later one replaces the earlier one outright,
 * so each call declares every plan it wants to keep.
 */

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
		"pooled createSchedule: free and paid pooled plans share one subscription pool, added entity sources join it",
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

		// ── Contract: the free source joins the paid plan's subscription pool ──
		const afterCustomerLevel = await getPooledBalanceDbState({
			db: ctx.db,
			customerId,
		});
		expect(afterCustomerLevel.pools).toHaveLength(1);
		expect(afterCustomerLevel.contributions).toHaveLength(2);

		const [subscriptionPool] = afterCustomerLevel.pools;
		expect(subscriptionPool.stripe_subscription_id).not.toBeNull();
		expect(subscriptionPool.granted).toBe(FREE_GRANT + PRO_GRANT);

		// ── Same plans again, plus an entity-scoped copy of each ─────────
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

		// ── Contract: contributions route to the pool matching identity ──
		const afterEntityLevel = await getPooledBalanceDbState({
			db: ctx.db,
			customerId,
		});
		expect(afterEntityLevel.contributions).toHaveLength(4);
		// No new pools: every entity source joined the existing subscription pool.
		expect(afterEntityLevel.pools).toHaveLength(1);

		const [subscriptionPoolAfter] = afterEntityLevel.pools;
		expect(subscriptionPoolAfter.id).toBe(subscriptionPool.id);
		expect(subscriptionPoolAfter.granted).toBe((FREE_GRANT + PRO_GRANT) * 2);
		for (const contribution of afterEntityLevel.contributions) {
			expect(contribution.pooled_balance_id).toBe(subscriptionPool.id);
		}

		// Every pool's granted equals the sum of the contributions feeding it.
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
