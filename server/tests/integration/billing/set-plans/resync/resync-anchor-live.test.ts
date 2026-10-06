/** A timestamp billing_cycle_anchor on a live subscription resets its cycle, and every plan on it, on the anchor. */

import { expect, test } from "bun:test";
import {
	formatMsToDate,
	ms,
	msToSeconds,
	type SetPlansParamsV0Input,
	secondsToMs,
} from "@autumn/shared";
import { advanceToAnchor } from "@tests/integration/billing/utils/advanceUtils/advanceToAnchor";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import {
	expectBillingCycleAnchorConsumed,
	expectCycleResetPhase,
} from "../utils/resyncUtils";
import { findStripeSubscriptionByStatus } from "../utils/subscriptionStateUtils";

test.concurrent(
	`${chalk.yellowBright("set-plans resync live: a timestamp anchor with proration none resets the cycle without prorating")}`,
	async () => {
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { customerId, autumnV2_4, ctx, advancedTo, testClockId } =
			await initScenario({
				customerId: "set-plans-resync-live-anchor",
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [pro] }),
				],
				actions: [s.billing.attach({ productId: pro.id })],
			});

		const anchorMs = advancedTo + ms.days(10);
		const params: SetPlansParamsV0Input = {
			customer_id: customerId,
			phases: [
				{
					billing_cycle_anchor: anchorMs,
					proration_behavior: "none",
					starts_at: "now",
					plans: [{ plan_id: pro.id }],
				},
			],
		};

		const preview = await autumnV2_4.billing.previewSetPlans(params);
		expect(preview.total).toBe(0);
		expect(preview.warnings).toContainEqual(
			expect.objectContaining({
				type: "cycle_reset",
				severity: "warning",
				message: `The billing cycle resets on ${formatMsToDate(anchorMs)}.`,
			}),
		);

		await autumnV2_4.billing.setPlans(params);

		await expectCustomerInvoiceCorrect({ customerId, count: 1 });
		await expectCycleResetPhase({
			ctx,
			customerId,
			anchorMs,
			prorationBehavior: "none",
		});
		await expectBalanceCorrect({
			customerId,
			featureId: TestFeature.Messages,
			remaining: 100,
			nextResetAt: anchorMs,
		});

		await advanceToAnchor({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			advancedTo,
			anchorMs,
		});

		// Stripe moves the anchor without invoicing; the first invoice is the new cycle's full renewal.
		await expectCustomerInvoiceCorrect({ customerId, count: 1 });
		const subscription = await findStripeSubscriptionByStatus({
			ctx,
			customerId,
			status: "active",
		});
		expect(subscription.billing_cycle_anchor).toBe(msToSeconds(anchorMs));

		const upcomingInvoice = await ctx.stripeCli.invoices.createPreview({
			subscription: subscription.id,
		});
		expect(
			upcomingInvoice.lines.data.some(
				(line) => line.parent?.subscription_item_details?.proration,
			),
		).toBe(false);
		expect(upcomingInvoice.total / 100).toBe(20);
		expect(preview.next_cycle?.total).toBe(20);
		expect(msToSeconds(preview.next_cycle?.starts_at ?? 0)).toBe(
			subscription.items.data[0]?.current_period_end,
		);

		// No invoice carries the reset, so Autumn re-anchors on Stripe's anchor move itself.
		await expectBillingCycleAnchorConsumed({
			ctx,
			customerId,
			productId: pro.id,
			anchorMs,
		});
		await expectBalanceCorrect({
			customerId,
			featureId: TestFeature.Messages,
			remaining: 100,
			nextResetAt: secondsToMs(
				subscription.items.data[0]?.current_period_end ?? 0,
			),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans resync live: a retained add-on left on the subscription resets on the anchor too")}`,
	async () => {
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const addOn = products.recurringAddOn({
			items: [items.monthlyWords({ includedUsage: 50 })],
		});

		const { customerId, autumnV2_4, advancedTo } = await initScenario({
			customerId: "set-plans-resync-live-anchor-addon",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, addOn] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.billing.attach({ productId: addOn.id }),
			],
		});

		const anchorMs = advancedTo + ms.days(10);
		await autumnV2_4.billing.setPlans<SetPlansParamsV0Input>({
			customer_id: customerId,
			undeclared_plans: "retain",
			phases: [
				{
					billing_cycle_anchor: anchorMs,
					proration_behavior: "none",
					starts_at: "now",
					plans: [{ plan_id: pro.id }],
				},
			],
		});

		await expectBalanceCorrect({
			customerId,
			featureId: TestFeature.Words,
			remaining: 50,
			nextResetAt: anchorMs,
		});
	},
);
