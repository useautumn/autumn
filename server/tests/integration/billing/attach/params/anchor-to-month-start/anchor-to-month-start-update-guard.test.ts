/**
 * Turning `config.anchor_to_month_start` on for a plan that customers are already on
 * patches the plan in place. Updating an existing subscription must not re-anchor it.
 *
 * Contract:
 *   attach (flag off) → flag turned on → subscriptions.update → Stripe anchor unchanged
 */

import { test } from "bun:test";
import {
	ApiVersion,
	secondsToMs,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { getStripeSubscription } from "@tests/integration/billing/utils/stripeSubscriptionUtils";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli";
import { expectStripeSubscriptionAnchorCorrect } from "./utils/anchorToMonthStartUtils";

test.concurrent(
	`${chalk.yellowBright("anchor-to-month-start guard 1: flag turned on later does not re-anchor an updated subscription")}`,
	async () => {
		const customerId = "anchor-month-update-guard";
		const pro = products.pro({
			id: "pro",
			items: [items.prepaidMessages({ billingUnits: 100, price: 10 })],
		});

		const { autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.billing.attach({
					productId: pro.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
				}),
			],
		});
		const { subscription } = await getStripeSubscription({ customerId });
		const originalAnchorMs = secondsToMs(subscription.billing_cycle_anchor);

		const rpc = new AutumnRpcCli({
			secretKey: ctx.orgSecretKey,
			version: ApiVersion.V2_1,
		});
		await rpc.post("/plans.update", {
			plan_id: pro.id,
			config: { anchor_to_month_start: true },
		});

		await autumnV2_3.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: pro.id,
			feature_quantities: [{ feature_id: TestFeature.Messages, quantity: 200 }],
			redirect_mode: "if_required",
		});

		await expectStripeSubscriptionAnchorCorrect({
			customerId,
			anchorMs: originalAnchorMs,
		});
	},
);
