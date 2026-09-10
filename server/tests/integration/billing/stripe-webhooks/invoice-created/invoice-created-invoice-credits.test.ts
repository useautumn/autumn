import { expect, test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import { findCustomerEntitlement } from "@tests/balances/utils/findCustomerEntitlement.js";
import { expectInvoiceLineItemsCorrect } from "@tests/integration/billing/utils/expectInvoiceLineItemsCorrect.js";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/expectStripeSubscriptionCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

for (const scenario of [
	{
		name: "funded",
		usage: 50,
		action1Amount: 10,
		action2Amount: 30,
		creditsApplied: 40,
		total: 20,
	},
	{
		name: "overage",
		usage: 250,
		action1Amount: 50,
		action2Amount: 150,
		creditsApplied: 100,
		total: 120,
	},
]) {
	test.concurrent(
		`${chalk.yellowBright(`invoice.created invoice credits: ${scenario.name} renewal omits the empty credit row`)}`,
		async () => {
			const invoiceCreditItem = items.consumable({
				featureId: TestFeature.InvoiceCredits,
				includedUsage: 100,
				price: 1,
			});
			const product = products.pro({
				id: `invoice-credit-renewal-${scenario.name}`,
				items: [invoiceCreditItem],
			});

			const { customerId, autumnV2_3, ctx } = await initScenario({
				customerId: `invoice-credit-renewal-${scenario.name}`,
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [product] }),
				],
				actions: [
					s.billing.attach({ productId: product.id }),
					s.track({ featureId: TestFeature.Action1, value: scenario.usage }),
					s.track({ featureId: TestFeature.Action2, value: scenario.usage }),
					s.advanceToNextInvoice({ withPause: true }),
				],
			});

			const customer =
				await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
			const renewalInvoice = customer.invoices?.[0];
			expect(renewalInvoice?.stripe_id).toBeDefined();
			expect(renewalInvoice?.total).toBe(scenario.total);

			const storedLineItems = await expectInvoiceLineItemsCorrect({
				stripeInvoiceId: renewalInvoice!.stripe_id,
				expectedCount: 4,
				expectedTotal: scenario.total,
				expectedLineItems: [
					{ isBasePrice: true, direction: "charge", amount: 20 },
					{
						featureId: TestFeature.Action1,
						direction: "charge",
						billingTiming: "in_arrear",
						amount: scenario.action1Amount,
					},
					{
						featureId: TestFeature.Action2,
						direction: "charge",
						billingTiming: "in_arrear",
						amount: scenario.action2Amount,
					},
					{
						featureId: TestFeature.InvoiceCredits,
						direction: "refund",
						billingTiming: "in_arrear",
						amount: -scenario.creditsApplied,
					},
				],
			});
			expect(
				storedLineItems.find(
					(lineItem) => lineItem.feature_id === TestFeature.InvoiceCredits,
				)?.description,
			).toBe("Credits applied");

			const stripeInvoice = await ctx.stripeCli.invoices.retrieve(
				renewalInvoice!.stripe_id,
			);
			await expectStripeSubscriptionCorrect({ ctx, customerId });
			expect(stripeInvoice.total).toBe(scenario.total * 100);
			expect(stripeInvoice.lines.data).toHaveLength(4);
			const action1Line = stripeInvoice.lines.data.find(
				(line) => line.description === `Action1, ${scenario.usage} units`,
			);
			const action2Line = stripeInvoice.lines.data.find(
				(line) => line.description === `Action2, ${scenario.usage} units`,
			);
			expect(action1Line?.quantity).toBe(1);
			expect(action2Line?.quantity).toBe(1);
			expect(
				stripeInvoice.lines.data.map((line) => line.description),
			).toContain("Credits applied");

			expect(customer.balances[TestFeature.InvoiceCredits].remaining).toBe(100);
			const resetCustomerEntitlement = await findCustomerEntitlement({
				ctx,
				customerId,
				featureId: TestFeature.InvoiceCredits,
			});
			expect(resetCustomerEntitlement?.usage_attribution).toEqual({});
		},
		{ timeout: 120_000 },
	);
}
