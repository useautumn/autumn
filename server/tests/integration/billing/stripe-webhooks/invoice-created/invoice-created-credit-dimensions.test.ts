/**
 * Contract: invoice credits drawn through dimensions bill one line per
 * (feature, dimension). Action1 is dimensioned by size inside the plan item's
 * feature_override; the renewal invoice carries a charge line per dimension
 * naming it, a single "Credits applied" refund, an unchanged total, and
 * attribution resets after billing.
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
	`${chalk.yellowBright("invoice.created credit dimensions: one charge line per dimension of the same feature")}`,
	async () => {
		const invoiceCreditItem = withFeatureOverride(
			items.consumable({
				featureId: TestFeature.InvoiceCredits,
				includedUsage: 100,
				price: 1,
			}),
			{
				schema: [
					{
						metered_feature_id: TestFeature.Action1,
						credit_amount: 0.2,
						dimensions: {
							large: { match: { size: "large" }, credit_amount: 1 },
						},
						multipliers: {
							spot: { match: { lifecycle: "spot" }, factor: 0.5 },
						},
					},
				],
			},
		);
		const product = products.pro({
			id: "dimension-invoice-credit",
			items: [invoiceCreditItem],
		});

		const { customerId, autumnV2_3, ctx } = await initScenario({
			customerId: "dimension-invoice-credit",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [product] }),
			],
			actions: [
				s.billing.attach({ productId: product.id }),
				// 20 large @ 1 = 20 · 20 large spot @ 0.5 = 10 · 50 plain @ 0.2 = 10.
				// 40 credits < 100 included, so the total stays the $20 base price.
				s.track({
					featureId: TestFeature.Action1,
					value: 20,
					properties: { size: "large" },
				}),
				s.track({
					featureId: TestFeature.Action1,
					value: 20,
					properties: { size: "large", lifecycle: "spot" },
				}),
				s.track({ featureId: TestFeature.Action1, value: 50 }),
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
					count: 2,
					totalAmount: 40,
				},
				{
					featureId: TestFeature.InvoiceCredits,
					direction: "refund",
					billingTiming: "in_arrear",
					amount: -40,
				},
			],
		});
		const action1Lines = storedLineItems
			.filter((lineItem) => lineItem.feature_id === TestFeature.Action1)
			.map((lineItem) => ({
				description: lineItem.description,
				amount: lineItem.amount,
			}))
			.sort((left, right) => left.amount - right.amount);
		expect(action1Lines).toEqual([
			{ description: "Action1, 50 units", amount: 10 },
			{ description: "Action1 — large, 40 units", amount: 30 },
		]);

		expect(customer.balances[TestFeature.InvoiceCredits].remaining).toBe(100);
		const resetCustomerEntitlement = await findCustomerEntitlement({
			ctx,
			customerId,
			featureId: TestFeature.InvoiceCredits,
		});
		expect(resetCustomerEntitlement?.usage_attribution).toEqual({});
	},
	{ timeout: 180_000 },
);
