import { test } from "bun:test";
import type { ApiCustomerV5, FeatureConfigOverride } from "@autumn/shared";
import { waitForInvoiceLineItems } from "@tests/integration/billing/utils/expectInvoiceLineItemsCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/**
 * A dimensioned rate card exercised end to end: several dimensions on one
 * feature, a graduated one, a stacking multiplier, and enough usage to run past
 * the included credits into overage — then printed as the invoice sees it.
 */
const dimensionedCredits: FeatureConfigOverride = {
	schema: [
		{
			metered_feature_id: TestFeature.Action1,
			credit_amount: 1,
			dimensions: {
				size_small: { match: { size: "small" }, credit_amount: 2 },
				size_large: { match: { size: "large" }, credit_amount: 16 },
				size_large_region_eu: {
					match: { size: "large", region: "eu" },
					credit_amount: 20,
				},
				size_xl: {
					match: { size: "xl" },
					tier_behavior: "graduated" as const,
					tiers: [
						{ to: 5, credit_amount: 10 },
						{ to: "inf" as const, credit_amount: 4 },
					],
				},
			},
			multipliers: {
				lifecycle_spot: { match: { lifecycle: "spot" }, factor: 0.25 },
			},
		},
	],
};

test(
	`${chalk.yellowBright("scenario: dimensioned invoice with overage")}`,
	async () => {
		const customerId = "credit-dimensions-invoice";
		const creditItem = {
			...items.consumable({
				featureId: TestFeature.InvoiceCredits,
				includedUsage: 100,
				price: 1,
			}),
			config: {
				...items.consumable({
					featureId: TestFeature.InvoiceCredits,
					includedUsage: 100,
					price: 1,
				}).config,
				feature_override: dimensionedCredits,
			},
		};
		const product = products.pro({
			id: "credit-dimensions-invoice",
			items: [creditItem],
		});

		// 3 small @2 = 6 · 4 large @16 = 64 · 2 large/eu @20 = 40
		// 6 xl graduated (5@10 + 1@4) = 54 · 4 large spot @16 x0.25 = 16
		// = 180 credits against 100 included -> 80 of overage.
		const { autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [product] }),
			],
			actions: [
				s.billing.attach({ productId: product.id }),
				s.track({
					featureId: TestFeature.Action1,
					value: 3,
					properties: { size: "small" },
				}),
				s.track({
					featureId: TestFeature.Action1,
					value: 4,
					properties: { size: "large" },
				}),
				s.track({
					featureId: TestFeature.Action1,
					value: 2,
					properties: { size: "large", region: "eu" },
				}),
				s.track({
					featureId: TestFeature.Action1,
					value: 6,
					properties: { size: "xl" },
				}),
				s.track({
					featureId: TestFeature.Action1,
					value: 4,
					properties: { size: "large", lifecycle: "spot" },
				}),
				s.advanceToNextInvoice({ withPause: true }),
			],
		});

		const checkLarge = await autumnV2_3.check({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			required_balance: 1,
			properties: { size: "large", region: "eu" },
		});
		const checkSpot = await autumnV2_3.check({
			customer_id: customerId,
			feature_id: TestFeature.Action1,
			required_balance: 1,
			properties: { size: "large", lifecycle: "spot" },
		});

		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId, {
			skip_cache: "true",
		});

		console.log(chalk.bold("\n─── check: one unit priced by properties ───"));
		console.log({
			"size=large, region=eu": checkLarge.required_balance,
			"size=large, lifecycle=spot": checkSpot.required_balance,
		});

		console.log(chalk.bold("\n─── balance ───"));
		console.log({
			credits: customer.balances?.[TestFeature.InvoiceCredits],
		});

		console.log(chalk.bold("\n─── invoices ───"));
		for (const invoice of customer.invoices ?? []) {
			console.log({
				stripe_id: invoice.stripe_id,
				total: invoice.total,
				status: invoice.status,
			});
		}

		const renewal = customer.invoices?.[0];
		if (renewal?.stripe_id) {
			const lineItems = await waitForInvoiceLineItems({
				stripeInvoiceId: renewal.stripe_id,
			});
			console.log(chalk.bold("\n─── invoice line items ───"));
			console.table(
				lineItems.map((line) => ({
					description: line.description,
					amount: line.amount,
					feature: line.feature_id ?? "—",
				})),
			);
		}
	},
	{ timeout: 240_000 },
);
