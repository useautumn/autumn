// Contract: pooled grants and customer prepaid credits are free before priced overage.
// A 100-credit absolute cap permits exactly 100 units of $0.01 overage.

import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	ErrCode,
	type TrackResponseV3,
} from "@autumn/shared";
import {
	buildPooledBalanceTestProducts,
	pooledBalanceTestValues,
} from "@tests/integration/balances/utils/pooledBalanceTestProducts.js";
import { setCustomerSpendLimit } from "@tests/integration/balances/utils/spend-limit-utils/customerSpendLimitUtils.js";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("pooled spend limit: prepaid and pooled grants precede capped $0.01 overage")}`,
	async () => {
		const { customerAddon, proEntityPlan } = buildPooledBalanceTestProducts({
			idPrefix: "pooled-spend-limit",
		});
		const { autumnV2_1, autumnV2_2, customerId, entities } = await initScenario(
			{
				customerId: "pooled-spend-limit",
				setup: [
					s.customer({ paymentMethod: "success", testClock: false }),
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
					s.billing.attach({ productId: proEntityPlan.id, entityIndex: 1 }),
				],
			},
		);

		await setCustomerSpendLimit({
			autumn: autumnV2_1,
			customerId,
			featureId: TestFeature.Messages,
			overageLimit: 100,
		});
		await Promise.all([
			autumnV2_2.customers.get(customerId),
			...entities.map((entity) =>
				autumnV2_2.entities.get(customerId, entity.id),
			),
		]);

		const trackResponse = (await autumnV2_2.track({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			value: 900,
		})) as TrackResponseV3;
		expect(trackResponse.balance).toMatchObject({
			granted: 800,
			remaining: 0,
			usage: 900,
			overage_allowed: true,
		});

		await expectAutumnError({
			errCode: ErrCode.InsufficientBalance,
			func: () =>
				autumnV2_2.track({
					customer_id: customerId,
					entity_id: entities[1].id,
					feature_id: TestFeature.Messages,
					value: 1,
					overage_behavior: "reject",
				}),
		});

		await timeout(2_000);
		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId, {
			skip_cache: "true",
		});
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.Messages,
			granted: 800,
			remaining: 0,
			usage: 900,
			breakdownCount: 3,
		});
	},
	60_000,
);
