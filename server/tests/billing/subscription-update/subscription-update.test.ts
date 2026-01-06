import { beforeAll, describe, expect, test } from "bun:test";
import {
	type ApiCustomer,
	ApiVersion,
	findPriceByFeatureId,
	type Price,
	priceToLineAmount,
} from "@autumn/shared";
import { expectLatestInvoiceCorrect } from "@tests/billing/utils/expectLatestInvoiceCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { ProductService } from "@/internal/products/ProductService";
import { constructPrepaidItem } from "@/utils/scriptUtils/constructItem.js";
import { constructRawProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { initCustomerV3 } from "@/utils/scriptUtils/testUtils/initCustomerV3.js";
import { initProductsV0 } from "@/utils/scriptUtils/testUtils/initProductsV0";

const billingUnits = 12;
const pricePerUnit = 8;

/**
 * Subscription Update - Core Tests
 *
 * These tests verify the fundamental subscription update flow:
 * - Basic quantity updates (upgrade, downgrade, no-op)
 * - Multiple feature updates (simultaneous and selective)
 *
 * For specialized tests, see:
 * - subscription-update-proration.test.ts - Proration configuration behavior
 * - subscription-update-cancellation.test.ts - Cancel/uncancel integration
 * - subscription-update-entitlements.test.ts - Internal entitlement verification
 * - subscription-update-invoicing.test.ts - Invoice generation behavior
 */

describe(`${chalk.yellowBright("subscription-update: basic quantity updates")}`, () => {
	const customerId = "sub-update-basic";
	const autumnV1 = new AutumnInt({ version: ApiVersion.V1_2 });

	const prepaidMessages = constructPrepaidItem({
		featureId: TestFeature.Messages,
		billingUnits,
		price: pricePerUnit,
	});

	const prepaidProduct = constructRawProduct({
		id: "prepaid_messages",
		items: [prepaidMessages],
	});

	let prepaidMessagesPrice: Price | undefined;

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			withTestClock: true,
			attachPm: "success",
		});

		await initProductsV0({
			ctx,
			products: [prepaidProduct],
			prefix: customerId,
		});

		const fullProduct = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: prepaidProduct.id,
			orgId: ctx.org.id,
			env: ctx.env,
		});

		prepaidMessagesPrice = findPriceByFeatureId({
			prices: fullProduct.prices,
			featureId: TestFeature.Messages,
		});

		await autumnV1.attach({
			customer_id: customerId,
			product_id: prepaidProduct.id,
			options: [
				{
					feature_id: TestFeature.Messages,
					quantity: 10 * billingUnits, // 120 messages = 10 units
				},
			],
		});
	});

	test("should upgrade quantity from 10 to 20 units", async () => {
		await autumnV1.subscriptionUpdate({
			customer_id: customerId,
			product_id: prepaidProduct.id,
			options: [
				{
					feature_id: TestFeature.Messages,
					quantity: 20 * billingUnits, // 240 messages
				},
			],
		});

		const customer = await autumnV1.customers.get<ApiCustomer>(customerId);
		const balance = customer.balances?.[TestFeature.Messages];

		// Should have 240 messages (20 units × 12 billing_units)
		expect(balance?.purchased_balance).toBe(240);
		expect(balance?.current_balance).toBe(240);

		// Expect invoices to be created
		expectLatestInvoiceCorrect({
			customer,
			productId: prepaidProduct.id,
			amount: priceToLineAmount({
				price: prepaidMessagesPrice!,
				overage: 10 * billingUnits,
			}),
		});
	});

	test("should downgrade quantity from 20 to 5 units", async () => {
		await autumnV1.subscriptionUpdate({
			customer_id: customerId,
			product_id: prepaidProduct.id,
			options: [
				{
					feature_id: TestFeature.Messages,
					quantity: 5 * billingUnits, // 60 messages
				},
			],
		});

		const customer = await autumnV1.customers.get<ApiCustomer>(customerId);

		const balance = customer.balances?.[TestFeature.Messages];

		// Should have 60 messages (5 units × 12 billing_units)
		expect(balance?.current_balance).toBe(60);

		// Expect credit invoice for downgrade (20 -> 5 = -15 units)
		const expectedAmount = priceToLineAmount({
			price: prepaidMessagesPrice!,
			overage: -15 * billingUnits,
		});

		expectLatestInvoiceCorrect({
			customer,
			productId: prepaidProduct.id,
			amount: expectedAmount,
		});
	});

	test("should update to same quantity (no-op)", async () => {
		const beforeUpdate = await autumnV1.customers.get<ApiCustomer>(customerId);
		const beforeBalance = beforeUpdate.balances?.[TestFeature.Messages];
		const beforeInvoiceCount = beforeUpdate.invoices?.length ?? 0;

		await autumnV1.subscriptionUpdate({
			customer_id: customerId,
			product_id: prepaidProduct.id,
			options: [
				{
					feature_id: TestFeature.Messages,
					quantity: 5 * billingUnits, // Same as current
				},
			],
		});

		const afterUpdate = await autumnV1.customers.get<ApiCustomer>(customerId);
		const afterBalance = afterUpdate.balances?.[TestFeature.Messages];
		const afterInvoiceCount = afterUpdate.invoices?.length ?? 0;

		expect(afterBalance?.current_balance).toBe(beforeBalance?.current_balance);

		// No-op should not create a new invoice
		expect(afterInvoiceCount).toBe(beforeInvoiceCount);
	});
});

describe(`${chalk.yellowBright("subscription-update: multiple features")}`, () => {
	const customerId = "sub-update-multi";
	const autumnV1 = new AutumnInt({ version: ApiVersion.V1_2 });

	const messagesBillingUnits = 10;
	const wordsBillingUnits = 100;

	const multiFeatureProduct = constructRawProduct({
		id: "multi_feature_product",
		items: [
			constructPrepaidItem({
				featureId: TestFeature.Messages,
				billingUnits: messagesBillingUnits,
				price: 5,
			}),
			constructPrepaidItem({
				featureId: TestFeature.Words,
				billingUnits: wordsBillingUnits,
				price: 10,
			}),
		],
	});

	let messagesPrice: Price | undefined;
	let wordsPrice: Price | undefined;

	beforeAll(async () => {
		await initCustomerV3({
			ctx,
			customerId,
			withTestClock: true,
			attachPm: "success",
		});

		await initProductsV0({
			ctx,
			products: [multiFeatureProduct],
			prefix: customerId,
		});

		const fullProduct = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: multiFeatureProduct.id,
			orgId: ctx.org.id,
			env: ctx.env,
		});

		messagesPrice = findPriceByFeatureId({
			prices: fullProduct.prices,
			featureId: TestFeature.Messages,
		});

		wordsPrice = findPriceByFeatureId({
			prices: fullProduct.prices,
			featureId: TestFeature.Words,
		});

		await autumnV1.attach({
			customer_id: customerId,
			product_id: multiFeatureProduct.id,
			options: [
				{
					feature_id: TestFeature.Messages,
					quantity: 5 * messagesBillingUnits, // 50 messages
				},
				{
					feature_id: TestFeature.Words,
					quantity: 2 * wordsBillingUnits, // 200 words
				},
			],
		});
	});

	test("should update both feature quantities simultaneously", async () => {
		await autumnV1.subscriptionUpdate({
			customer_id: customerId,
			product_id: multiFeatureProduct.id,
			options: [
				{
					feature_id: TestFeature.Messages,
					quantity: 10 * messagesBillingUnits, // 100 messages
				},
				{
					feature_id: TestFeature.Words,
					quantity: 5 * wordsBillingUnits, // 500 words
				},
			],
		});

		const customer = await autumnV1.customers.get<ApiCustomer>(customerId);

		const messagesBalance = customer.balances?.[TestFeature.Messages];
		expect(messagesBalance?.purchased_balance).toBe(100);

		const wordsBalance = customer.balances?.[TestFeature.Words];
		expect(wordsBalance?.purchased_balance).toBe(500);

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
			productId: multiFeatureProduct.id,
			amount: expectedAmount,
		});
	});

	test("should update only one feature while keeping the other unchanged", async () => {
		await autumnV1.subscriptionUpdate({
			customer_id: customerId,
			product_id: multiFeatureProduct.id,
			options: [
				{
					feature_id: TestFeature.Messages,
					quantity: 15 * messagesBillingUnits, // 150 messages (changed)
				},
				{
					feature_id: TestFeature.Words,
					quantity: 5 * wordsBillingUnits, // 500 words (unchanged)
				},
			],
		});

		const customer = await autumnV1.customers.get<ApiCustomer>(customerId);

		const messagesBalance = customer.balances?.[TestFeature.Messages];
		expect(messagesBalance?.purchased_balance).toBe(150);

		const wordsBalance = customer.balances?.[TestFeature.Words];
		expect(wordsBalance?.purchased_balance).toBe(500);

		// Invoice total: Messages (10->15 units = +5), Words unchanged
		const expectedAmount = priceToLineAmount({
			price: messagesPrice!,
			overage: 5 * messagesBillingUnits,
		});

		expectLatestInvoiceCorrect({
			customer,
			productId: multiFeatureProduct.id,
			amount: expectedAmount,
		});

		// Verify Stripe invoice has only 2 line items
		const stripeInvoices = await ctx.stripeCli.invoices.list({
			customer: customer.stripe_id!,
		});

		const latestInvoice = stripeInvoices.data[0];
		expect(latestInvoice.lines.data.length).toBe(2);
	});
});
