// Contract: a 50%-capped pooled rollover uses the aggregate grant in get/check/track.
// Rollover credits drain before the newly reset main pooled balance.

import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	type CheckResponseV3,
	EntInterval,
	PooledBalanceResetMode,
	RolloverExpiryDurationType,
	type TrackResponseV3,
} from "@autumn/shared";
import { expectPooledBalanceCorrect } from "@tests/integration/billing/pooled-balances/utils/expectPooledBalanceCorrect.js";
import { expirePooledBalanceForReset } from "@tests/integration/billing/pooled-balances/utils/expirePooledBalanceForReset.js";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const CONTRIBUTION = 200;
const POOLED_GRANT = CONTRIBUTION * 2;
const ROLLOVER_GRANT = POOLED_GRANT * 0.5;

test.concurrent(
	`${chalk.yellowBright("pooled rollover: max 50% is exposed and consumed before the reset grant")}`,
	async () => {
		const pooledPlan = products.base({
			id: "pooled-track-rollover-percent",
			items: [
				{
					...items.monthlyMessagesWithRollover({
						includedUsage: CONTRIBUTION,
						rolloverConfig: {
							max_percentage: 50,
							length: 1,
							duration: RolloverExpiryDurationType.Month,
						},
					}),
					pooled: true,
				},
			],
		});
		const { autumnV2_2, ctx, customerId, entities } = await initScenario({
			customerId: "pooled-track-rollover-percent",
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 3, featureId: TestFeature.Users }),
				s.products({ list: [pooledPlan] }),
			],
			actions: [
				s.billing.attach({ productId: pooledPlan.id, entityIndex: 0 }),
				s.billing.attach({ productId: pooledPlan.id, entityIndex: 1 }),
				s.track({
					featureId: TestFeature.Messages,
					value: 100,
					entityIndex: 2,
					timeout: 2_000,
				}),
			],
		});

		await expirePooledBalanceForReset({
			ctx,
			customerId,
			resetMode: PooledBalanceResetMode.Lazy,
		});
		const afterReset = await autumnV2_2.customers.get<ApiCustomerV5>(
			customerId,
			{ skip_cache: "true" },
		);
		expectBalanceCorrect({
			customer: afterReset,
			featureId: TestFeature.Messages,
			granted: POOLED_GRANT + ROLLOVER_GRANT,
			remaining: POOLED_GRANT + ROLLOVER_GRANT,
			usage: 0,
			rollovers: [{ balance: ROLLOVER_GRANT }],
		});

		const [exactCheck, aboveCheck] = await Promise.all([
			autumnV2_2.check<CheckResponseV3>({
				customer_id: customerId,
				entity_id: entities[0].id,
				feature_id: TestFeature.Messages,
				required_balance: POOLED_GRANT + ROLLOVER_GRANT,
			}),
			autumnV2_2.check<CheckResponseV3>({
				customer_id: customerId,
				entity_id: entities[2].id,
				feature_id: TestFeature.Messages,
				required_balance: POOLED_GRANT + ROLLOVER_GRANT + 1,
			}),
		]);
		expect(exactCheck.allowed).toBe(true);
		expect(aboveCheck.allowed).toBe(false);

		const trackResponse = (await autumnV2_2.track({
			customer_id: customerId,
			entity_id: entities[2].id,
			feature_id: TestFeature.Messages,
			value: 250,
			overage_behavior: "reject",
		})) as TrackResponseV3;
		expect(trackResponse.balance).toMatchObject({
			granted: POOLED_GRANT + ROLLOVER_GRANT,
			remaining: 350,
			usage: 250,
		});

		await timeout(2_000);
		const finalCustomer = await autumnV2_2.customers.get<ApiCustomerV5>(
			customerId,
			{ skip_cache: "true" },
		);
		expectBalanceCorrect({
			customer: finalCustomer,
			featureId: TestFeature.Messages,
			granted: POOLED_GRANT + ROLLOVER_GRANT,
			remaining: 350,
			usage: 250,
			rollovers: [{ balance: 0 }],
		});
		await expectPooledBalanceCorrect({
			db: ctx.db,
			customerId,
			pool: {
				balance: 350,
				adjustment: 0,
				granted: POOLED_GRANT,
				interval: EntInterval.Month,
				nextResetAt: "present",
				resetCycleAnchor: "present",
				resetMode: PooledBalanceResetMode.Lazy,
				stripeSubscriptionId: null,
				rollovers: [{ balance: 0, usage: ROLLOVER_GRANT }],
			},
			contributions: {
				count: 2,
				currentContribution: CONTRIBUTION,
				nextCycleContribution: CONTRIBUTION,
			},
			sources: { count: 2, balance: 0, adjustment: 0 },
		});
	},
);
