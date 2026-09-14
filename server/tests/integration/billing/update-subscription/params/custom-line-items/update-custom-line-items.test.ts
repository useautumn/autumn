import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	CustomerExpand,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { createPercentCoupon } from "@tests/integration/billing/utils/discounts/discountTestUtils.js";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect.js";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/expectStripeSubscriptionCorrect.js";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { items } from "@tests/utils/fixtures/items.js";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import { addMonths } from "date-fns";

// Custom lines replace immediate invoice amounts, while the requested subscription changes still apply.
// Preview, discounts, zero totals, suppressed proration, legacy requests, and anchor resets share this contract.
for (const mode of [
	"quantity",
	"customize",
	"standalone",
	"discount",
	"zero",
	"none",
	"legacy",
] as const) {
	test.concurrent(`update custom line items: ${mode}`, async () => {
		const customerId = `update-custom-lines-${mode}`;
		const plan = products.pro({
			id: "pro",
			items: [
				items.prepaidMessages({
					includedUsage: 0,
					billingUnits: 100,
					price: 10,
				}),
			],
		});
		const { autumnV1, autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [plan] }),
			],
			actions: [
				s.attach({
					productId: plan.id,
					options: [{ feature_id: "messages", quantity: 300 }],
				}),
			],
		});
		const customLineItems =
			mode === "zero"
				? [
						{ amount: 17, description: "Agreed charge" },
						{ amount: -17, description: "Loyalty credit" },
					]
				: [
						{ amount: 15, description: "Agreed charge" },
						{ amount: 5, description: "Service fee" },
					];
		const coupon =
			mode === "discount"
				? await createPercentCoupon({
						stripeCli: ctx.stripeCli,
						percentOff: 25,
					})
				: undefined;
		const params = {
			customer_id: customerId,
			plan_id: plan.id,
			custom_line_items: customLineItems,
			...(mode === "standalone" || mode === "customize"
				? {}
				: { feature_quantities: [{ feature_id: "messages", quantity: 600 }] }),
			...(mode === "customize"
				? { customize: { price: itemsV2.monthlyPrice({ amount: 35 }) } }
				: {}),
			...(coupon ? { discounts: [{ reward_id: coupon.id }] } : {}),
			...(mode === "none" ? { proration_behavior: "none" as const } : {}),
		} satisfies UpdateSubscriptionV1ParamsInput;
		const legacyParams = {
			customer_id: customerId,
			product_id: plan.id,
			options: [{ feature_id: "messages", quantity: 600 }],
			custom_line_items: customLineItems,
		};
		const preview =
			mode === "legacy"
				? await autumnV1.subscriptions.previewUpdate(legacyParams)
				: await autumnV2_2.subscriptions.previewUpdate<typeof params>(params);
		const suppressed = mode === "none";
		let expectedTotal = mode === "discount" ? 15 : 20;
		if (suppressed || mode === "zero") expectedTotal = 0;
		expect(preview.total).toBe(expectedTotal);
		expect(preview.line_items).toHaveLength(suppressed ? 0 : 2);
		if (!suppressed) {
			for (const line of customLineItems) {
				expect(preview.line_items).toContainEqual(
					expect.objectContaining({
						description: line.description,
						subtotal: line.amount,
					}),
				);
			}
		}
		if (mode === "discount") {
			expect(preview.subtotal).toBe(20);
			expect(preview.line_items[0].discounts[0].amount_off).toBe(3.75);
		}
		const before = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer: before,
			featureId: "messages",
			remaining: 300,
		});
		const result =
			mode === "legacy"
				? await autumnV1.subscriptions.update(legacyParams)
				: await autumnV2_2.subscriptions.update<typeof params>(params);
		if (expectedTotal === 0) {
			expect(result.invoice).toBeUndefined();
		} else {
			expect(result.invoice?.stripe_id).toBeDefined();
			const invoice = await ctx.stripeCli.invoices.retrieve(
				result.invoice.stripe_id,
			);
			expect(invoice.total).toBe(expectedTotal * 100);
			expect(invoice.lines.data).toHaveLength(2);
			for (const line of customLineItems) {
				expect(invoice.lines.data).toContainEqual(
					expect.objectContaining({
						description:
							mode === "discount"
								? `${line.description} [inc. discount]`
								: line.description,
						amount: line.amount * (mode === "discount" ? 75 : 100),
					}),
				);
			}
		}
		await expectCustomerInvoiceCorrect({
			customerId,
			count: expectedTotal === 0 ? 1 : 2,
			latestTotal: expectedTotal === 0 ? 50 : expectedTotal,
		});
		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId, {
			expand: [CustomerExpand.SubscriptionsPlan],
		});
		expectBalanceCorrect({
			customer,
			featureId: "messages",
			remaining: mode === "standalone" || mode === "customize" ? 300 : 600,
		});
		if (mode === "customize") {
			expect(customer.subscriptions[0].plan?.price?.amount).toBe(35);
		}
		await expectStripeSubscriptionCorrect({ ctx, customerId });
	});
}

test.concurrent(
	"update custom line items: anchor reset keeps the custom invoice amount",
	async () => {
		const customerId = "update-custom-lines-anchor";
		const plan = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { autumnV2_2, ctx, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [plan] }),
			],
			actions: [
				s.attach({ productId: plan.id }),
				s.advanceTestClock({ days: 14 }),
			],
		});
		const params = {
			customer_id: customerId,
			plan_id: plan.id,
			billing_cycle_anchor: "now" as const,
			custom_line_items: [{ amount: 7, description: "Agreed cycle reset" }],
		};
		const preview =
			await autumnV2_2.subscriptions.previewUpdate<typeof params>(params);
		expect(preview.total).toBe(7);
		const result = await autumnV2_2.subscriptions.update<typeof params>(params);
		expect(result.invoice?.stripe_id).toBeDefined();
		const invoice = await ctx.stripeCli.invoices.retrieve(
			result.invoice.stripe_id,
		);
		expect(invoice.total).toBe(700);
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 2,
			latestTotal: 7,
		});
		await expectBalanceCorrect({
			customerId,
			autumn: autumnV2_2,
			featureId: "messages",
			nextResetAt: addMonths(advancedTo, 1).getTime(),
		});
		await expectStripeSubscriptionCorrect({ ctx, customerId });
		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		if (!customer.stripe_id) throw new Error("Expected Stripe customer");
		const subscriptions = await ctx.stripeCli.subscriptions.list({
			customer: customer.stripe_id,
			status: "active",
		});
		expect(subscriptions.data).toHaveLength(1);
		expect(subscriptions.data[0].billing_cycle_anchor).toBe(
			Math.floor(advancedTo / 1000),
		);
	},
);
