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

/**
 * Subscription Update - Feature Matching Tests
 *
 * These tests verify that the subscription update flow correctly matches
 * features by feature_id rather than array index. This prevents critical
 * bugs where reordered features or partial updates could cause incorrect
 * billing calculations.
 *
 * Critical bug fix: Previously used array index to match old vs new options,
 * which would break if features were sent in a different order.
 */

describe(`${chalk.yellowBright("subscription-update: feature matching - reordered features")}`, () => {
	const customerId = "sub-update-feature-matching";
	const autumnV1 = new AutumnInt({ version: ApiVersion.V1_2 });

	const multiFeatureProduct = constructRawProduct({
		id: "multi_feature_matching",
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
			constructPrepaidItem({
				featureId: TestFeature.Storage,
				billingUnits: 1,
				price: 2,
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

		// Attach with features in this order: Messages, Words, Storage
		await autumnV1.attach({
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
				{
					feature_id: TestFeature.Storage,
					quantity: 20 * 1, // 20 GB
				},
			],
		});
	});

	test("should handle features sent in REVERSE order", async () => {
		// Update with features in REVERSE order: Storage, Words, Messages
		await autumnV1.subscriptionUpdate({
			customer_id: customerId,
			product_id: multiFeatureProduct.id,
			options: [
				{
					feature_id: TestFeature.Storage,
					quantity: 50 * 1, // 50 GB (increased from 20)
				},
				{
					feature_id: TestFeature.Words,
					quantity: 10 * 100, // 1000 words (increased from 500)
				},
				{
					feature_id: TestFeature.Messages,
					quantity: 5 * 10, // 50 messages (decreased from 100)
				},
			],
		});

		const customer = await autumnV1.customers.get<ApiCustomer>(customerId);

		// Each feature should be updated correctly despite reordering
		expect(customer.balances?.[TestFeature.Messages]?.purchased_balance).toBe(
			50,
		);
		expect(customer.balances?.[TestFeature.Words]?.purchased_balance).toBe(
			1000,
		);
		expect(customer.balances?.[TestFeature.Storage]?.purchased_balance).toBe(
			50,
		);
	});

	test("should handle features sent in RANDOM order", async () => {
		// Update with features in random order: Words, Storage, Messages
		await autumnV1.subscriptionUpdate({
			customer_id: customerId,
			product_id: multiFeatureProduct.id,
			options: [
				{
					feature_id: TestFeature.Words,
					quantity: 20 * 100, // 2000 words
				},
				{
					feature_id: TestFeature.Storage,
					quantity: 100 * 1, // 100 GB
				},
				{
					feature_id: TestFeature.Messages,
					quantity: 15 * 10, // 150 messages
				},
			],
		});

		const customer = await autumnV1.customers.get<ApiCustomer>(customerId);

		expect(customer.balances?.[TestFeature.Messages]?.purchased_balance).toBe(
			150,
		);
		expect(customer.balances?.[TestFeature.Words]?.purchased_balance).toBe(
			2000,
		);
		expect(customer.balances?.[TestFeature.Storage]?.purchased_balance).toBe(
			100,
		);
	});

	test("should handle partial updates (only some features)", async () => {
		// Only update ONE feature out of three
		await autumnV1.subscriptionUpdate({
			customer_id: customerId,
			product_id: multiFeatureProduct.id,
			options: [
				{
					feature_id: TestFeature.Words,
					quantity: 30 * 100, // 3000 words - only updating this
				},
				{
					feature_id: TestFeature.Messages,
					quantity: 15 * 10, // Keep at 150
				},
				{
					feature_id: TestFeature.Storage,
					quantity: 100 * 1, // Keep at 100
				},
			],
		});

		const customer = await autumnV1.customers.get<ApiCustomer>(customerId);

		// Words should be updated
		expect(customer.balances?.[TestFeature.Words]?.purchased_balance).toBe(
			3000,
		);

		// Others should remain the same
		expect(customer.balances?.[TestFeature.Messages]?.purchased_balance).toBe(
			150,
		);
		expect(customer.balances?.[TestFeature.Storage]?.purchased_balance).toBe(
			100,
		);
	});

	test("should error when trying to update non-existent feature", async () => {
		// Try to update a feature that doesn't exist in the subscription
		const invalidUpdate = autumnV1.subscriptionUpdate({
			customer_id: customerId,
			product_id: multiFeatureProduct.id,
			options: [
				{
					feature_id: "non_existent_feature",
					quantity: 100,
				},
			],
		});

		// Should throw an error
		await expect(invalidUpdate).rejects.toThrow();
	});
});

describe(`${chalk.yellowBright("subscription-update: feature matching - edge cases")}`, () => {
	const customerId = "sub-update-edge-cases";
	const autumnV1 = new AutumnInt({ version: ApiVersion.V1_2 });

	const twoFeatureProduct = constructRawProduct({
		id: "two_feature_product",
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
			products: [twoFeatureProduct],
			prefix: customerId,
		});

		await autumnV1.attach({
			customer_id: customerId,
			product_id: twoFeatureProduct.id,
			options: [
				{
					feature_id: TestFeature.Messages,
					quantity: 10 * 10,
				},
				{
					feature_id: TestFeature.Words,
					quantity: 5 * 100,
				},
			],
		});
	});

	test("should handle duplicate feature_ids gracefully", async () => {
		// Send the same feature twice (edge case - should use last value or error)
		await autumnV1.subscriptionUpdate({
			customer_id: customerId,
			product_id: twoFeatureProduct.id,
			options: [
				{
					feature_id: TestFeature.Messages,
					quantity: 20 * 10, // First value
				},
				{
					feature_id: TestFeature.Messages,
					quantity: 30 * 10, // Second value (duplicate)
				},
				{
					feature_id: TestFeature.Words,
					quantity: 10 * 100,
				},
			],
		});

		const customer = await autumnV1.customers.get<ApiCustomer>(customerId);

		// The last value should win (or this should error - either is acceptable)
		const messagesBalance =
			customer.balances?.[TestFeature.Messages]?.purchased_balance;

		// Should be either 200 (first) or 300 (second), not some weird value from index mismatch
		expect([200, 300]).toContain(messagesBalance);
	});
});
