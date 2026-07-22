// Contract: a customer usage window gates tracks across entities sharing pooled grants.
// Existing balance usage is preserved while only post-limit tracks consume window headroom.

import { expect, test } from "bun:test";
import { ErrCode, type TrackResponseV3 } from "@autumn/shared";
import {
	buildPooledBalanceTestProducts,
	pooledBalanceTestValues,
} from "@tests/integration/balances/utils/pooledBalanceTestProducts.js";
import {
	expectCustomerUsageLimit,
	setCustomerUsageLimit,
} from "@tests/integration/balances/utils/usage-limit-utils/customerUsageLimitUtils.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("pooled usage window: a shared cap clamps tracks after free-to-Pro replacement")}`,
	async () => {
		const { freeEntityPlan, proEntityPlan } = buildPooledBalanceTestProducts({
			idPrefix: "pooled-usage-window",
		});
		const { autumnV2_2, autumnV2_3, customerId, entities } = await initScenario(
			{
				customerId: "pooled-usage-window",
				setup: [
					s.customer({ paymentMethod: "success", testClock: false }),
					s.entities({ count: 2, featureId: TestFeature.Users }),
					s.products({ list: [freeEntityPlan, proEntityPlan] }),
				],
				actions: [
					s.billing.attach({ productId: freeEntityPlan.id, entityIndex: 0 }),
					s.billing.attach({ productId: freeEntityPlan.id, entityIndex: 1 }),
					s.track({
						featureId: TestFeature.Messages,
						value: 40,
						entityIndex: 1,
						timeout: 2_000,
					}),
				],
			},
		);
		await autumnV2_2.billing.attach({
			customer_id: customerId,
			entity_id: entities[0].id,
			plan_id: proEntityPlan.id,
			plan_schedule: "immediate",
		});

		const windowLimit = 35;
		await setCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			limit: windowLimit,
		});
		await Promise.all([
			autumnV2_3.customers.get(customerId),
			...entities.map((entity) =>
				autumnV2_3.entities.get(customerId, entity.id),
			),
		]);

		const clampedTrack = (await autumnV2_3.track({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			value: 60,
		})) as TrackResponseV3;
		expect(clampedTrack.value).toBe(60);
		expect(clampedTrack.balance).toMatchObject({
			granted:
				pooledBalanceTestValues.freeContribution +
				pooledBalanceTestValues.proContribution,
			remaining: 75,
			usage: 75,
		});
		await expectCustomerUsageLimit({
			autumn: autumnV2_3,
			customerId,
			featureId: TestFeature.Messages,
			usage: windowLimit,
			limit: windowLimit,
		});

		await expectAutumnError({
			errCode: ErrCode.InsufficientBalance,
			func: () =>
				autumnV2_3.track({
					customer_id: customerId,
					entity_id: entities[1].id,
					feature_id: TestFeature.Messages,
					value: 1,
					overage_behavior: "reject",
				}),
		});
	},
);
