// Red: customer aggregation omitted rollover grant from entity-scoped products.
// Green: customer granted includes active entity rollover balance and usage.

import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	type LimitedItem,
	ProductItemInterval,
	RolloverExpiryDurationType,
} from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expireAllCusEntsForReset } from "@tests/utils/cusProductUtils/resetTestUtils.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";

test.concurrent(
	`${chalk.yellowBright("get-customer: entity product rollovers contribute to granted")}`,
	async () => {
		const customerId = "get-customer-entity-rollover-granted";
		const rolloverConfig = {
			max: 500,
			length: 1,
			duration: RolloverExpiryDurationType.Month,
		};
		const creditsItem = constructFeatureItem({
			featureId: TestFeature.Credits,
			includedUsage: 100,
			interval: ProductItemInterval.Month,
			rolloverConfig,
		}) as LimitedItem;
		const base = products.base({
			id: "entity-product-rollover-granted",
			items: [creditsItem],
		});

		const { autumnV1, autumnV2_2, ctx, entities } = await initScenario({
			customerId,
			setup: [
				s.deleteCustomer({ customerId }),
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [base] }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
			],
			actions: [s.billing.attach({ productId: base.id, entityIndex: 0 })],
		});

		await autumnV1.track({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Credits,
			value: 40,
		});
		await new Promise((resolve) => setTimeout(resolve, 2000));

		await expireAllCusEntsForReset({
			ctx,
			customerId,
			featureId: TestFeature.Credits,
		});
		await autumnV2_2.entities.get(customerId, entities[0].id);

		const after = await autumnV2_2.customers.get<ApiCustomerV5>(customerId, {
			skip_cache: "true",
		});

		expectBalanceCorrect({
			customer: after,
			featureId: TestFeature.Credits,
			remaining: 160,
			usage: 0,
		});
		expect(after.balances[TestFeature.Credits].granted).toBe(160);
	},
);
