/**
 * Regression: an add-on canceled at end of cycle drops off via an Autumn-built
 * Stripe schedule. When that phase advances, sub.updated back-sync must not
 * re-match the surviving base price and swap the customer's plan version.
 *
 * Setup: pro v1 + add-on on one sub → pro v2 published → add-on canceled EOC.
 * Red (pre-fix): after the cycle turns, pro is replaced by v2.
 * Green: add-on gone, pro still v1, and the schedule carries Autumn's stamp.
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { BillingInterval, ResetInterval } from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { getSubscriptionId } from "@tests/integration/billing/utils/stripe/getSubscriptionId";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import {
	WEBHOOK_SETTLE_TIMEOUT_MS,
	WEBHOOK_TEST_TIMEOUT_MS,
} from "@tests/utils/pollableCustomerExpect";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import type Stripe from "stripe";
import { AUTUMN_STRIPE_METADATA_KEYS } from "@/internal/billing/v2/providers/stripe/utils/common/autumnStripeMetadata";

const attachedVersion = ({
	customer,
	planId,
}: {
	customer: ApiCustomerV3;
	planId: string;
}) => customer.products.find((product) => product.id === planId)?.version;

test(
	chalk.yellowBright(
		"sub.updated: Autumn-scheduled add-on drop keeps the customer's plan version",
	),
	async () => {
		const customerId = "sub-updated-sched-addon-drop-version";
		const pro = products.pro({
			id: "sched-addon-drop-pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const addon = products.base({
			id: "sched-addon-drop-addon",
			isAddOn: true,
			items: [
				items.monthlyPrice({ price: 10 }),
				items.monthlyUsers({ includedUsage: 5 }),
			],
		});

		const { autumnV1, autumnV2_3, ctx, testClockId } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, addon] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.billing.attach({ productId: addon.id }),
			],
		});

		// A newer pro version sharing the same base price — the bait for back-sync.
		await autumnV2_3.catalogV2.update({
			plans: [
				{
					plan_id: pro.id,
					versioning: "new_version",
					active: true,
					price: { amount: 20, interval: BillingInterval.Month },
					items: [
						{
							feature_id: TestFeature.Messages,
							included: 500,
							reset: { interval: ResetInterval.Month },
						},
					],
				},
			],
		});

		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: addon.id,
			cancel_action: "cancel_end_of_cycle",
		});

		const subscriptionId = await getSubscriptionId({
			ctx,
			customerId,
			productId: pro.id,
		});
		const subscription = await ctx.stripeCli.subscriptions.retrieve(
			subscriptionId,
			{ expand: ["schedule"] },
		);
		const schedule = subscription.schedule as Stripe.SubscriptionSchedule;
		expect(
			schedule?.metadata?.[AUTUMN_STRIPE_METADATA_KEYS.managedAt],
		).toBeDefined();

		// In production the cycle turns weeks after the cancel, long past the
		// 10-minute recency window on the subscription stamp. Age it to match.
		await ctx.stripeCli.subscriptions.update(subscriptionId, {
			metadata: { [AUTUMN_STRIPE_METADATA_KEYS.managedAt]: "1" },
		});

		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
		});

		const customer = (await expectCustomerProducts({
			autumn: autumnV1,
			customerId,
			settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
			active: [pro.id],
			notPresent: [addon.id],
		})) as ApiCustomerV3;
		expect(attachedVersion({ customer, planId: pro.id })).toBe(1);
	},
	WEBHOOK_TEST_TIMEOUT_MS,
);
