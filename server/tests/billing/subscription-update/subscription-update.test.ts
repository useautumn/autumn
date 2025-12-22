import { beforeAll, describe, expect, test } from "bun:test";
import { type ApiCustomer, ApiVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
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

	const prepaidProduct = constructRawProduct({
		id: "prepaid_messages",
		items: [
			constructPrepaidItem({
				featureId: TestFeature.Messages,
				billingUnits,
				price: pricePerUnit,
			}),
		],
	});

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
		expect(balance?.purchased_balance).toBe(60);
	});

	test("should update to same quantity (no-op)", async () => {
		const beforeUpdate = await autumnV1.customers.get<ApiCustomer>(customerId);
		const beforeBalance = beforeUpdate.balances?.[TestFeature.Messages];

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

		expect(afterBalance?.purchased_balance).toBe(
			beforeBalance?.purchased_balance,
		);
	});
});

describe(`${chalk.yellowBright("subscription-update: multiple features")}`, () => {
	const customerId = "sub-update-multi";
	const autumnV1 = new AutumnInt({ version: ApiVersion.V1_2 });

	const multiFeatureProduct = constructRawProduct({
		id: "multi_feature_product",
		items: [
			constructPrepaidItem({
				featureId: TestFeature.Messages,
				billingUnits: 10,
				price: 5,
			}),
			constructPrepaidItem({
				featureId: TestFeature.Words,
				billingUnits: 100,
				price: 10,
			}),
		],
	});

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

		await autumnV1.attach({
			customer_id: customerId,
			product_id: multiFeatureProduct.id,
			options: [
				{
					feature_id: TestFeature.Messages,
					quantity: 5 * 10, // 50 messages
				},
				{
					feature_id: TestFeature.Words,
					quantity: 2 * 100, // 200 words
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
					quantity: 10 * 10, // 100 messages
				},
				{
					feature_id: TestFeature.Words,
					quantity: 5 * 100, // 500 words
				},
			],
		});

		const customer = await autumnV1.customers.get<ApiCustomer>(customerId);

		const messagesBalance = customer.balances?.[TestFeature.Messages];
		expect(messagesBalance?.purchased_balance).toBe(100);

		const wordsBalance = customer.balances?.[TestFeature.Words];
		expect(wordsBalance?.purchased_balance).toBe(500);
	});

	test("should update only one feature while keeping the other unchanged", async () => {
		await autumnV1.subscriptionUpdate({
			customer_id: customerId,
			product_id: multiFeatureProduct.id,
			options: [
				{
					feature_id: TestFeature.Messages,
					quantity: 15 * 10, // 150 messages (changed)
				},
				{
					feature_id: TestFeature.Words,
					quantity: 5 * 100, // 500 words (unchanged)
				},
			],
		});

		const customer = await autumnV1.customers.get<ApiCustomer>(customerId);

		const messagesBalance = customer.balances?.[TestFeature.Messages];
		expect(messagesBalance?.purchased_balance).toBe(150);

		const wordsBalance = customer.balances?.[TestFeature.Words];
		expect(wordsBalance?.purchased_balance).toBe(500);
	});
});
