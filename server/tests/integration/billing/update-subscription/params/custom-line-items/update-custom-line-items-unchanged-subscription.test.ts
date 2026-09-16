import { expect, test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect.js";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/expectStripeSubscriptionCorrect.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";

// Custom invoice lines must work without incidental Stripe item or anchor changes.
for (const prorationBehavior of ["prorate_immediately", "none"] as const) {
	test.concurrent(
		`update custom line items: unchanged subscription ${prorationBehavior}`,
		async () => {
			const customerId = `update-custom-lines-unchanged-${prorationBehavior}`;
			const plan = products.pro({
				id: "pro",
				items: [items.monthlyMessages({ includedUsage: 100 })],
			});
			const { autumnV2_2, ctx } = await initScenario({
				customerId,
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [plan] }),
				],
				actions: [s.billing.attach({ productId: plan.id })],
			});
			const customer =
				await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
			if (!customer.stripe_id) throw new Error("Expected Stripe customer");
			const subscriptions = await ctx.stripeCli.subscriptions.list({
				customer: customer.stripe_id,
				status: "active",
			});
			expect(subscriptions.data).toHaveLength(1);
			const before = subscriptions.data[0];

			for (const amount of [7, 9]) {
				const params = {
					customer_id: customerId,
					plan_id: plan.id,
					custom_line_items: [
						{ amount, description: `Agreed charge ${amount}` },
					],
					proration_behavior: prorationBehavior,
				};
				const preview = await autumnV2_2.subscriptions.previewUpdate(params);
				expect(preview.total).toBe(prorationBehavior === "none" ? 0 : amount);
				const result = await autumnV2_2.subscriptions.update(params);
				if (prorationBehavior === "none") {
					expect(result.invoice).toBeUndefined();
				} else {
					expect(result.invoice?.stripe_id).toBeDefined();
					const invoice = await ctx.stripeCli.invoices.retrieve(
						result.invoice.stripe_id,
					);
					expect(invoice.total).toBe(amount * 100);
					expect(invoice.lines.data).toHaveLength(1);
					expect(invoice.lines.data[0].description).toBe(
						`Agreed charge ${amount}`,
					);
				}

				const after = await ctx.stripeCli.subscriptions.retrieve(before.id);
				expect(after.billing_cycle_anchor).toBe(before.billing_cycle_anchor);
				expect(
					after.items.data.map(({ id, price, quantity }) => ({
						id,
						price: price.id,
						quantity,
					})),
				).toEqual(
					before.items.data.map(({ id, price, quantity }) => ({
						id,
						price: price.id,
						quantity,
					})),
				);
			}
			await expectCustomerInvoiceCorrect({
				customerId,
				count: prorationBehavior === "none" ? 1 : 3,
				latestTotal: prorationBehavior === "none" ? 20 : 9,
			});
			await expectStripeSubscriptionCorrect({ ctx, customerId });
		},
	);
}
