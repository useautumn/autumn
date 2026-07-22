/** After subscription renewal creates a capped pooled rollover, Pro → Enterprise preserves that rollover.
 * The upgrade applies only the contribution delta and leaves the customer-level prepaid add-on unchanged. */

import { test } from "bun:test";
import type { AttachParamsV1Input } from "@autumn/shared";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/index.js";
import chalk from "chalk";
import {
	expectPooledRolloverTransitionCorrect,
	setupPooledRolloverTransitionScenario,
} from "../utils/pooledBalanceRolloverTransitionTestUtils.js";

test.concurrent(
	`${chalk.yellowBright("pooled rollover attach: Pro to Enterprise preserves rollover and prepaid add-on")}`,
	async () => {
		const scenario = await setupPooledRolloverTransitionScenario({
			customerId: "pooled-rollover-upgrade-enterprise",
		});

		await scenario.autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: scenario.customerId,
			entity_id: scenario.entities[0].id,
			plan_id: scenario.enterprise.id,
			redirect_mode: "if_required",
		});
		await expectStripeSubscriptionCorrect({
			ctx: scenario.ctx,
			customerId: scenario.customerId,
		});

		await expectPooledRolloverTransitionCorrect({
			scenario,
			expectedProductId: scenario.enterprise.id,
		});
	},
);
