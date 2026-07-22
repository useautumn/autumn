// Contract: pooled entity grants compose with customer prepaid and overage balances.
// Mid-cycle contribution changes and free-to-Pro replacement preserve aggregate usage.

import { expect, test } from "bun:test";
import type { ApiCustomerV5, TrackResponseV3 } from "@autumn/shared";
import {
	buildPooledBalanceTestProducts,
	pooledBalanceTestValues,
} from "@tests/integration/balances/utils/pooledBalanceTestProducts.js";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { timeout } from "@tests/utils/genUtils.js";
import { advanceTestClock } from "@tests/utils/stripeUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("pooled mixed lifecycle: customer prepaid and overage survive mid-cycle entity contributions")}`,
	async () => {
		const { customerAddon, proEntityPlan } = buildPooledBalanceTestProducts({
			idPrefix: "pooled-mixed-midcycle",
		});
		const { autumnV2_2, ctx, customerId, entities, testClockId, advancedTo } =
			await initScenario({
				customerId: "pooled-mixed-midcycle",
				setup: [
					s.customer({ paymentMethod: "success", testClock: true }),
					s.entities({ count: 2, featureId: TestFeature.Users }),
					s.products({ list: [customerAddon, proEntityPlan] }),
				],
				actions: [
					s.billing.attach({
						productId: customerAddon.id,
						options: [
							{
								feature_id: TestFeature.Messages,
								quantity: pooledBalanceTestValues.prepaidQuantity,
							},
						],
					}),
					s.billing.attach({ productId: proEntityPlan.id, entityIndex: 0 }),
				],
			});
		if (!testClockId) throw new Error("Expected a Stripe test clock");

		const firstTrack = (await autumnV2_2.track({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			value: 650,
			overage_behavior: "reject",
		})) as TrackResponseV3;
		expect(firstTrack.balance).toMatchObject({
			granted: 700,
			remaining: 50,
			usage: 650,
			overage_allowed: true,
		});

		const firstAdvance = await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId,
			startingFrom: new Date(advancedTo),
			numberOfDays: 10,
			waitForSeconds: 5,
		});
		await autumnV2_2.billing.attach({
			customer_id: customerId,
			entity_id: entities[1].id,
			plan_id: proEntityPlan.id,
		});

		const afterSecondAttach =
			await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: afterSecondAttach,
			featureId: TestFeature.Messages,
			granted: 800,
			remaining: 150,
			usage: 650,
			breakdownCount: 3,
		});

		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId,
			startingFrom: new Date(firstAdvance),
			numberOfDays: 10,
			waitForSeconds: 5,
		});
		const afterSecondAdvance =
			await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: afterSecondAdvance,
			featureId: TestFeature.Messages,
			granted: 800,
			remaining: 150,
			usage: 650,
			breakdownCount: 3,
		});
	},
	60_000,
);

test.concurrent(
	`${chalk.yellowBright("pooled mixed lifecycle: free-to-Pro replacement swaps one contribution without losing usage")}`,
	async () => {
		const { freeEntityPlan, proEntityPlan } = buildPooledBalanceTestProducts({
			idPrefix: "pooled-free-to-pro",
		});
		const { autumnV2_2, customerId, entities } = await initScenario({
			customerId: "pooled-free-to-pro",
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
				s.products({ list: [freeEntityPlan, proEntityPlan] }),
			],
			actions: [
				s.billing.attach({ productId: freeEntityPlan.id, entityIndex: 0 }),
				s.billing.attach({ productId: freeEntityPlan.id, entityIndex: 1 }),
			],
		});

		await autumnV2_2.track({
			customer_id: customerId,
			entity_id: entities[1].id,
			feature_id: TestFeature.Messages,
			value: 40,
		});
		await timeout(2_000);
		await autumnV2_2.billing.attach({
			customer_id: customerId,
			entity_id: entities[0].id,
			plan_id: proEntityPlan.id,
			plan_schedule: "immediate",
		});

		const afterUpgrade =
			await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: afterUpgrade,
			featureId: TestFeature.Messages,
			granted: 150,
			remaining: 110,
			usage: 40,
			breakdownCount: 2,
		});

		const secondTrack = (await autumnV2_2.track({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			value: 70,
			overage_behavior: "reject",
		})) as TrackResponseV3;
		expect(secondTrack.balance).toMatchObject({
			granted: 150,
			remaining: 40,
			usage: 110,
		});
	},
	60_000,
);
