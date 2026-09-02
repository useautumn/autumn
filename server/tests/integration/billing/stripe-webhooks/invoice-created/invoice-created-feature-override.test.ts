/**
 * Contract: invoice credits generated from an overridden schema are correct.
 * The plan item's feature_override reprices InvoiceCredits' members (Action1
 * 0.2→0.5, Action2 0.6→1); the renewal invoice's per-source charge lines and
 * "Credits applied" refund reflect the override-priced usage_attribution,
 * the funded total stays unchanged, and attribution resets after billing.
 */

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
		// Catalog InvoiceCredits schema: Action1 at 0.2, Action2 at 0.6.
		// Override: Action1 at 0.5, Action2 at 1.
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
				// 50 * 0.5 = 25 credits; 50 * 1 = 50 credits. Total 75 < 100
				// included, so the invoice total stays the $20 base price.
				s.track({ featureId: TestFeature.Action1, value: 50 }),
				s.track({ featureId: TestFeature.Action2, value: 50 }),
				s.advanceToNextInvoice({ withPause: true }),
			],
		});

		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		const renewalInvoice = customer.invoices?.[0];
		expect(renewalInvoice?.stripe_id).toBeDefined();
		expect(renewalInvoice?.total).toBe(20);

		// Charge lines carry override-priced credits (25 + 50), fully offset by
		// the "Credits applied" refund — catalog pricing would read 10 + 30.
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

		// Balance resets and attribution clears after the renewal bills it.
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
