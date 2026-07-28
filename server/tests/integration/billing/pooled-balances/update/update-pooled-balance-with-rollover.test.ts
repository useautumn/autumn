/** After subscription renewal creates a capped pooled rollover, increasing the pooled grant preserves that rollover.
 * The transition applies only the contribution delta and leaves the customer-level prepaid add-on unchanged. */

import { test } from "bun:test";
import type { UpdateSubscriptionV1ParamsInput } from "@autumn/shared";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/index.js";
import chalk from "chalk";
import {
	expectPooledRolloverTransitionCorrect,
	setupPooledRolloverTransitionScenario,
	updatedPooledPlanItem,
} from "../utils/pooledBalanceRolloverTransitionTestUtils.js";

test.concurrent(
	`${chalk.yellowBright("pooled rollover update: grant increase preserves rollover and prepaid add-on")}`,
	async () => {
		const scenario = await setupPooledRolloverTransitionScenario({
			customerId: "pooled-rollover-update-grant",
		});

		await scenario.autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>(
			{
				customer_id: scenario.customerId,
				customer_product_id: scenario.sourceCustomerProduct.id,
				entity_id: scenario.entities[0].id,
				customize: { items: [updatedPooledPlanItem] },
			},
		);
		await expectStripeSubscriptionCorrect({
			ctx: scenario.ctx,
			customerId: scenario.customerId,
		});

		await expectPooledRolloverTransitionCorrect({
			scenario,
			expectedProductId: scenario.pro.id,
		});
	},
);
