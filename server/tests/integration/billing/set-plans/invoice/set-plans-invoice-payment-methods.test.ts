/**
 * setPlans in invoice mode writes invoice_mode.payment_method_types onto the
 * Stripe subscription and its first invoice, like attach does.
 */

import { expect, test } from "bun:test";
import type { SetPlansParamsV0Input } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("set plans: invoice_mode.payment_method_types lands on the Stripe subscription")}`,
	async () => {
		const customerId = "set-plans-invoice-pm";
		const pro = products.pro({
			id: "pro-set-plans-pm",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { customer, autumnV2_4 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [pro] })],
			actions: [],
		});

		await autumnV2_4.billing.setPlans<SetPlansParamsV0Input>({
			customer_id: customerId,
			phases: [{ starts_at: "now", plans: [{ plan_id: pro.id }] }],
			invoice_mode: {
				enabled: true,
				finalize: true,
				enable_plan_immediately: true,
				payment_method_types: ["card", "us_bank_account"],
			},
		});

		const subscription = (
			await ctx.stripeCli.subscriptions.list({
				customer: customer!.processor!.id!,
				limit: 1,
			})
		).data[0];
		expect(subscription.collection_method).toBe("send_invoice");
		expect(subscription.payment_settings?.payment_method_types).toEqual([
			"card",
			"us_bank_account",
		]);

		const invoice = await ctx.stripeCli.invoices.retrieve(
			subscription.latest_invoice as string,
		);
		expect(invoice.payment_settings.payment_method_types).toEqual([
			"card",
			"us_bank_account",
		]);
	},
);
