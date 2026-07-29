/**
 * A one-off fee deferred to a future activation phase must carry the explicit
 * `tax_rate_id`. One-off `add_invoice_items` don't inherit the subscription's
 * default_tax_rates, so without a per-item rate the deferred charge is billed
 * untaxed — the delayed twin of the immediate one-off bug.
 */

import { expect, test } from "bun:test";
import type { AttachParamsV1Input } from "@autumn/shared";
import { getCustomerProduct } from "@tests/integration/billing/attach/params/start-date/utils";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addDays } from "date-fns";
import type Stripe from "stripe";

const ONBOARDING_FEE = 20;

const addInvoiceItemTaxRateIds = (
	item: Stripe.SubscriptionSchedule.Phase.AddInvoiceItem,
): string[] =>
	(item.tax_rates ?? []).map((rate) =>
		typeof rate === "string" ? rate : rate.id,
	);

test.concurrent(
	`${chalk.yellowBright("attach-tax-rate-id (deferred one-off): explicit tax_rate_id rides the activating phase add_invoice_item")}`,
	async () => {
		const customerId = "attach-tax-rate-deferred-one-off";
		const pro = products.pro({
			id: "pro-deferred-oneoff-tax",
			items: [
				items.oneOffMessages({
					includedUsage: 0,
					billingUnits: 1,
					price: ONBOARDING_FEE,
				}),
			],
		});

		const { autumnV2_2, ctx, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		const taxRate = await ctx.stripeCli.taxRates.create({
			display_name: "Test Tax",
			percentage: 10,
			inclusive: false,
		});

		const startDate = addDays(advancedTo, 7).getTime();

		await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
			starts_at: startDate,
			feature_quantities: [{ feature_id: TestFeature.Messages, quantity: 1 }],
			tax_rate_id: taxRate.id,
		});

		const cusProduct = await getCustomerProduct({
			ctx,
			customerId,
			productId: pro.id,
		});
		const scheduleId = cusProduct.scheduled_ids?.[0];
		expect(scheduleId).toBeDefined();

		const schedule = (await ctx.stripeCli.subscriptionSchedules.retrieve(
			scheduleId!,
		)) as Stripe.SubscriptionSchedule;

		const firstPhase = schedule.phases[0];
		expect(firstPhase?.add_invoice_items.length ?? 0).toBeGreaterThanOrEqual(1);

		const taxedItem = firstPhase.add_invoice_items.find((item) =>
			addInvoiceItemTaxRateIds(item).includes(taxRate.id),
		);
		expect(taxedItem).toBeDefined();
	},
);
