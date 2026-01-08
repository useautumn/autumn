import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	findPriceByFeatureId,
	priceToLineAmount,
} from "@autumn/shared";
import { expectLatestInvoiceCorrect } from "@tests/billing/utils/expectLatestInvoiceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { ProductService } from "@/internal/products/ProductService.js";

/**
 * Subscription Update - Increase Quantity Tests
 *
 * These tests verify quantity upgrades:
 * - Basic single-feature upgrade (10 → 20 units)
 * - Simultaneous multi-feature upgrade
 * - Selective upgrade (one feature changed, others unchanged)
 */

test.concurrent(
	`${chalk.yellowBright("update-quantity: upgrade 10 to 20 units")}`,
	async () => {
		const customerId = "inc-qty-basic-upgrade";
		const billingUnits = 12;
		const pricePerUnit = 8;

		const prepaidItem = items.prepaid({
			featureId: TestFeature.Messages,
			billingUnits,
			price: pricePerUnit,
		});

		const product = products.base({
			id: "prepaid",
			items: [prepaidItem],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [product] }),
			],
			actions: [
				s.attach({
					productId: product.id,
					options: [
						{ feature_id: TestFeature.Messages, quantity: 10 * billingUnits },
					],
				}),
			],
		});

		// Get price for invoice validation
		const fullProduct = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: product.id,
			orgId: ctx.org.id,
			env: ctx.env,
		});

		const prepaidMessagesPrice = findPriceByFeatureId({
			prices: fullProduct.prices,
			featureId: TestFeature.Messages,
		});

		// Upgrade from 10 to 20 units
		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: product.id,
			options: [
				{ feature_id: TestFeature.Messages, quantity: 20 * billingUnits },
			],
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		const feature = customer.features?.[TestFeature.Messages];

		// Should have 240 messages (20 units × 12 billing_units)
		expect(feature?.balance).toBe(240);

		// Expect upgrade invoice for +10 units
		expectLatestInvoiceCorrect({
			customer,
			productId: product.id,
			amount: priceToLineAmount({
				price: prepaidMessagesPrice!,
				overage: 10 * billingUnits,
			}),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("update-quantity: upgrade multiple features simultaneously")}`,
	async () => {
		const customerId = "inc-qty-multi-feature";
		const messagesBillingUnits = 10;
		const wordsBillingUnits = 100;

		const product = products.base({
			id: "multi_feature",
			items: [
				items.prepaid({
					featureId: TestFeature.Messages,
					billingUnits: messagesBillingUnits,
					price: 5,
				}),
				items.prepaid({
					featureId: TestFeature.Words,
					billingUnits: wordsBillingUnits,
				}),
			],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [product] }),
			],
			actions: [
				s.attach({
					productId: product.id,
					options: [
						{
							feature_id: TestFeature.Messages,
							quantity: 5 * messagesBillingUnits,
						},
						{
							feature_id: TestFeature.Words,
							quantity: 2 * wordsBillingUnits,
						},
					],
				}),
			],
		});

		// Get prices for invoice validation
		const fullProduct = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: product.id,
			orgId: ctx.org.id,
			env: ctx.env,
		});

		const messagesPrice = findPriceByFeatureId({
			prices: fullProduct.prices,
			featureId: TestFeature.Messages,
		});

		const wordsPrice = findPriceByFeatureId({
			prices: fullProduct.prices,
			featureId: TestFeature.Words,
		});

		// Upgrade both features
		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: product.id,
			options: [
				{
					feature_id: TestFeature.Messages,
					quantity: 10 * messagesBillingUnits,
				},
				{
					feature_id: TestFeature.Words,
					quantity: 5 * wordsBillingUnits,
				},
			],
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		expect(customer.features?.[TestFeature.Messages]?.balance).toBe(100);
		expect(customer.features?.[TestFeature.Words]?.balance).toBe(500);

		// Invoice total: Messages (5->10 units = +5) + Words (2->5 units = +3)
		const expectedAmount =
			priceToLineAmount({
				price: messagesPrice!,
				overage: 5 * messagesBillingUnits,
			}) +
			priceToLineAmount({
				price: wordsPrice!,
				overage: 3 * wordsBillingUnits,
			});

		expectLatestInvoiceCorrect({
			customer,
			productId: product.id,
			amount: expectedAmount,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("update-quantity: upgrade one feature, keep other unchanged")}`,
	async () => {
		const customerId = "inc-qty-selective";
		const messagesBillingUnits = 10;
		const wordsBillingUnits = 100;

		const product = products.base({
			id: "selective_upgrade",
			items: [
				items.prepaid({
					featureId: TestFeature.Messages,
					billingUnits: messagesBillingUnits,
					price: 5,
				}),
				items.prepaid({
					featureId: TestFeature.Words,
					billingUnits: wordsBillingUnits,
				}),
			],
		});

		const { autumnV1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [product] }),
			],
			actions: [
				s.attach({
					productId: product.id,
					options: [
						{
							feature_id: TestFeature.Messages,
							quantity: 10 * messagesBillingUnits,
						},
						{
							feature_id: TestFeature.Words,
							quantity: 5 * wordsBillingUnits,
						},
					],
				}),
			],
		});

		// Get price for invoice validation
		const fullProduct = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: product.id,
			orgId: ctx.org.id,
			env: ctx.env,
		});

		const messagesPrice = findPriceByFeatureId({
			prices: fullProduct.prices,
			featureId: TestFeature.Messages,
		});

		// Upgrade only messages, keep words unchanged
		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: product.id,
			options: [
				{
					feature_id: TestFeature.Messages,
					quantity: 15 * messagesBillingUnits,
				},
				{
					feature_id: TestFeature.Words,
					quantity: 5 * wordsBillingUnits, // unchanged
				},
			],
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		expect(customer.features?.[TestFeature.Messages]?.balance).toBe(150);
		expect(customer.features?.[TestFeature.Words]?.balance).toBe(500);

		// Invoice should only have messages upgrade (10->15 = +5 units)
		const expectedAmount = priceToLineAmount({
			price: messagesPrice!,
			overage: 5 * messagesBillingUnits,
		});

		expectLatestInvoiceCorrect({
			customer,
			productId: product.id,
			amount: expectedAmount,
		});

		// Verify Stripe invoice has only 2 line items (credit + debit for messages only)
		const stripeInvoices = await ctx.stripeCli.invoices.list({
			customer: customer.stripe_id!,
		});

		const latestInvoice = stripeInvoices.data[0];
		expect(latestInvoice.lines.data.length).toBe(2);
	},
);
