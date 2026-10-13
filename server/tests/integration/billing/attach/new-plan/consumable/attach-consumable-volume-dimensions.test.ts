/**
 * Pay-per-use volume on dimensioned credits: bills resolved credits past included at their net tier.
 * Invoice-credit features (DimensionCredits) bill credits 1:1 and ignore tiers, so this uses Credits.
 */

import { test } from "bun:test";
import type { FeatureConfigOverride } from "@autumn/shared";
import { expectInvoiceLineItemsCorrect } from "@tests/integration/billing/utils/expectInvoiceLineItemsCorrect";
import { expectNextInvoiceMatchesPreview } from "@tests/integration/billing/utils/expectNextInvoiceMatchesPreview";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const dimensionedAction1: FeatureConfigOverride = {
	schema: [
		{
			metered_feature_id: TestFeature.Action1,
			credit_amount: 0.2,
			dimensions: {
				large: { match: { size: "large" }, credit_amount: 16 },
			},
			multipliers: {
				spot: { match: { lifecycle: "spot" }, factor: 0.5 },
			},
		},
	],
};

test.concurrent(
	`${chalk.yellowBright("consumable-volume-dimensions 1: 730 resolved credits (100 included) bill the 630 over at net band 2; preview = invoice")}`,
	async () => {
		const customerId = "cons-volume-dimensions";
		// 40 large × 16 = 640 · 10 large spot × 16 × 0.5 = 80 · 50 plain × 0.2 = 10
		// 730 credits − 100 included = 630 over (net band 2, 501+): 630 × $0.05 = $31.50
		const expectedFeatureAmount = 31.5;

		const volumeCreditsItem = items.volumeConsumable({
			featureId: TestFeature.Credits,
			includedUsage: 100,
		});
		const pro = products.pro({
			id: customerId,
			items: [
				{
					...volumeCreditsItem,
					config: {
						...volumeCreditsItem.config,
						feature_override: dimensionedAction1,
					},
				},
			],
		});

		const scenario = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.track({
					featureId: TestFeature.Action1,
					value: 40,
					properties: { size: "large" },
					timeout: 2_000,
				}),
				s.track({
					featureId: TestFeature.Action1,
					value: 10,
					properties: { size: "large", lifecycle: "spot" },
					timeout: 2_000,
				}),
				s.track({
					featureId: TestFeature.Action1,
					value: 50,
					timeout: 3_000,
				}),
			],
		});

		const { renewalInvoice } = await expectNextInvoiceMatchesPreview({
			ctx: scenario.ctx,
			autumnV1: scenario.autumnV1,
			autumnV2_2: scenario.autumnV2_2,
			customerId,
			testClockId: scenario.testClockId!,
			advancedTo: scenario.advancedTo,
			featureId: TestFeature.Credits,
			expectedFeatureAmount,
		});
		await expectInvoiceLineItemsCorrect({
			stripeInvoiceId: renewalInvoice.stripe_id,
			expectedTotal: renewalInvoice.total,
			expectedLineItems: [
				{
					featureId: TestFeature.Credits,
					billingTiming: "in_arrear",
					totalAmount: expectedFeatureAmount,
				},
			],
		});
	},
);
