import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	findActiveCustomerProductById,
	truncateMsToSecondPrecision,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect.js";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/expectStripeSubscriptionCorrect.js";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import { addDays, addMonths } from "date-fns";
import { CusService } from "@/internal/customers/CusService.js";

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

// A scheduled anchor defers the cycle reset, so the custom lines bill on their own now.
test.concurrent(
	"update custom line items: scheduled anchor bills now and defers the reset",
	async () => {
		const customerId = "update-custom-lines-scheduled-anchor";
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
		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		if (!customer.stripe_id) throw new Error("Expected Stripe customer");
		const subscriptions = await ctx.stripeCli.subscriptions.list({
			customer: customer.stripe_id,
			status: "active",
		});
		expect(subscriptions.data).toHaveLength(1);
		const before = subscriptions.data[0];
		const scheduledAnchorMs = truncateMsToSecondPrecision(
			addDays(advancedTo, 40).getTime(),
		);
		const params = {
			customer_id: customerId,
			plan_id: plan.id,
			billing_cycle_anchor: scheduledAnchorMs,
			custom_line_items: [{ amount: 7, description: "Agreed charge" }],
		} satisfies UpdateSubscriptionV1ParamsInput;
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
		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});
		const customerProduct = findActiveCustomerProductById({
			fullCus: fullCustomer,
			productId: plan.id,
		});
		if (!customerProduct) throw new Error("Expected active pro product");
		expect(customerProduct.billing_cycle_anchor_resets_at).toBe(
			scheduledAnchorMs,
		);
		const after = await ctx.stripeCli.subscriptions.retrieve(before.id);
		expect(after.billing_cycle_anchor).toBe(before.billing_cycle_anchor);
		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);
