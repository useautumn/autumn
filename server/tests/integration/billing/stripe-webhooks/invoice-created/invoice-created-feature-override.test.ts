import { expect, test } from "bun:test";
import type { ApiCustomerV5, FeatureConfigOverride } from "@autumn/shared";
import { findCustomerEntitlement } from "@tests/balances/utils/findCustomerEntitlement.js";
import { expectInvoiceLineItemsCorrect } from "@tests/integration/billing/utils/expectInvoiceLineItemsCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

const withFeatureOverride = (
	item: ReturnType<typeof items.consumable>,
	featureOverride: FeatureConfigOverride,
) => ({
	...item,
	config: { ...item.config, feature_override: featureOverride },
});

test.concurrent(
	`${chalk.yellowBright("invoice.created feature-override: invoice credits bill at the override rate")}`,
	async () => {
		const invoiceCreditItem = withFeatureOverride(
			items.consumable({
				featureId: TestFeature.InvoiceCredits,
				includedUsage: 100,
				price: 1,
			}),
			{
				schema: [
					{ metered_feature_id: TestFeature.Action1, credit_amount: 0.5 },
					{ metered_feature_id: TestFeature.Action2, credit_amount: 1 },
				],
			},
		);
		const product = products.pro({
			id: "override-invoice-credit",
			items: [invoiceCreditItem],
		});

		const { customerId, autumnV2_3, ctx } = await initScenario({
			customerId: "override-invoice-credit",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [product] }),
			],
			actions: [
				s.billing.attach({ productId: product.id }),
				s.track({ featureId: TestFeature.Action1, value: 50 }),
				s.track({ featureId: TestFeature.Action2, value: 50 }),
				s.advanceToNextInvoice({ withPause: true }),
			],
		});

		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		const renewalInvoice = customer.invoices?.[0];
		expect(renewalInvoice?.stripe_id).toBeDefined();
		expect(renewalInvoice?.total).toBe(20);

		const storedLineItems = await expectInvoiceLineItemsCorrect({
			stripeInvoiceId: renewalInvoice!.stripe_id,
			expectedCount: 4,
			expectedTotal: 20,
			expectedLineItems: [
				{ isBasePrice: true, direction: "charge", amount: 20 },
				{
					featureId: TestFeature.Action1,
					direction: "charge",
					billingTiming: "in_arrear",
					amount: 25,
				},
				{
					featureId: TestFeature.Action2,
					direction: "charge",
					billingTiming: "in_arrear",
					amount: 50,
				},
				{
					featureId: TestFeature.InvoiceCredits,
					direction: "refund",
					billingTiming: "in_arrear",
					amount: -75,
				},
			],
		});
		expect(
			storedLineItems.find(
				(lineItem) => lineItem.feature_id === TestFeature.InvoiceCredits,
			)?.description,
		).toBe("Credits applied");

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
