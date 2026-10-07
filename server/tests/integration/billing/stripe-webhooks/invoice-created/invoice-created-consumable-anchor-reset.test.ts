/** A scheduled anchor move bills the cut-short period's usage, from the last renewal to the anchor, on the anchor invoice. */

import { expect, test } from "bun:test";
import { ms, secondsToMs } from "@autumn/shared";
import { advancePastCycleStart } from "@tests/integration/billing/set-plans/billing-cycle-anchor/utils/anchorCycleUtils";
import { findStripeSubscriptionByStatus } from "@tests/integration/billing/set-plans/utils/subscriptionStateUtils";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("invoice.created consumable: an anchor move after a renewal bills usage from the renewal to the anchor")}`,
	async () => {
		const pro = products.pro({
			items: [items.consumableMessages({ includedUsage: 0 })],
		});
		const { customerId, autumnV2_4, ctx, advancedTo, testClockId } =
			await initScenario({
				customerId: "inv-created-consumable-anchor-after-renewal",
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [pro] }),
				],
				actions: [
					s.billing.attach({ productId: pro.id }),
					s.advanceToNextInvoice(),
					s.track({
						featureId: TestFeature.Messages,
						value: 100,
						timeout: 2000,
					}),
				],
			});

		const renewedSubscription = await findStripeSubscriptionByStatus({
			ctx,
			customerId,
			status: "active",
		});
		const renewedAt = renewedSubscription.items.data[0]!.current_period_start;

		const anchorMs = advancedTo + ms.days(10);
		await autumnV2_4.billing.setPlans({
			customer_id: customerId,
			phases: [
				{
					billing_cycle_anchor: anchorMs,
					starts_at: advancedTo,
					plans: [{ plan_id: pro.id }],
				},
			],
		});
		// Stop while the anchor invoice is still a draft so invoice.created can add the usage line.
		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			advanceTo: anchorMs + ms.minutes(1),
			waitForSeconds: 30,
		});
		await advancePastCycleStart({
			ctx,
			testClockId: testClockId!,
			cycleStartsAt: anchorMs,
		});

		const { data: invoices } = await ctx.stripeCli.invoices.list({
			subscription: renewedSubscription.id,
			limit: 10,
			expand: ["data.lines"],
		});
		const anchorInvoice = invoices.find(
			(invoice) => invoice.billing_reason === "subscription_update",
		);
		const usageLine = anchorInvoice?.lines.data.find((line) =>
			line.metadata?.autumn_line_item_id?.startsWith("invoice_li_usage_"),
		);

		expect(usageLine?.amount).toBe(1000);
		expect(usageLine?.period.start).toBe(renewedAt);
		expect(secondsToMs(usageLine!.period.end)).toBeLessThanOrEqual(anchorMs);
		expect(secondsToMs(usageLine!.period.end)).toBeGreaterThan(
			anchorMs - ms.hours(1),
		);
	},
);
