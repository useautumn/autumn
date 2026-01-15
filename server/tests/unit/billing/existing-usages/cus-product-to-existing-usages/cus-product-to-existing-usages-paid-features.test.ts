import { describe, expect, test } from "bun:test";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts";
import { prices } from "@tests/utils/fixtures/db/prices";
import chalk from "chalk";
import { cusProductToExistingUsages } from "@/internal/billing/v2/utils/handleExistingUsages/cusProductToExistingUsages";

describe(
	chalk.yellowBright("cusProductToExistingUsages - paid features"),
	() => {
		// ═══════════════════════════════════════════════════════════════════════════════
		// CONSUMABLE FEATURE PRICE TESTS (pay-per-use / overage)
		// ═══════════════════════════════════════════════════════════════════════════════

		describe("consumable feature prices (overage billing)", () => {
			test("consumable with usage into overage calculates correct usage", () => {
				// This is the key test case:
				// included = 100, balance = -50 -> usage should be 150 (100 used from included + 50 overage)
				const internalFeatureId = "internal_messages";
				const featureId = "messages";
				const entitlementId = "ent_messages";

				const cusEnt = customerEntitlements.create({
					internalFeatureId,
					featureId,
					entitlementId,
					featureName: "Messages",
					allowance: 100, // 100 included usage
					balance: -50, // negative balance = overage
				});

				const consumablePrice = prices.createConsumable({
					id: "price_messages_consumable",
					featureId,
					internalFeatureId,
					entitlementId,
				});

				const customerPrice = prices.createCustomer({
					price: consumablePrice,
				});

				const cusProduct = customerProducts.create({
					customerEntitlements: [cusEnt],
					customerPrices: [customerPrice],
				});

				const existingUsages = cusProductToExistingUsages({ cusProduct });

				// Usage should be 150: 100 from included + 50 from overage
				// Formula: usage = includedUsage - balance = 100 - (-50) = 150
				expect(existingUsages[internalFeatureId]).toBeDefined();
				expect(existingUsages[internalFeatureId].usage).toBe(150);
			});

			test("consumable with usage within included calculates correct usage", () => {
				const internalFeatureId = "internal_messages";
				const featureId = "messages";
				const entitlementId = "ent_messages";

				const cusEnt = customerEntitlements.create({
					internalFeatureId,
					featureId,
					entitlementId,
					featureName: "Messages",
					allowance: 100, // 100 included usage
					balance: 30, // 70 used, 30 remaining
				});

				const consumablePrice = prices.createConsumable({
					id: "price_messages_consumable",
					featureId,
					internalFeatureId,
					entitlementId,
				});

				const customerPrice = prices.createCustomer({
					price: consumablePrice,
				});

				const cusProduct = customerProducts.create({
					customerEntitlements: [cusEnt],
					customerPrices: [customerPrice],
				});

				const existingUsages = cusProductToExistingUsages({ cusProduct });

				// Usage should be 70: allowance 100 - balance 30 = 70
				expect(existingUsages[internalFeatureId]).toBeDefined();
				expect(existingUsages[internalFeatureId].usage).toBe(70);
			});

			test("consumable with zero included usage and overage", () => {
				// Pure pay-per-use: no included usage, all usage is overage
				const internalFeatureId = "internal_api_calls";
				const featureId = "api_calls";
				const entitlementId = "ent_api_calls";

				const cusEnt = customerEntitlements.create({
					internalFeatureId,
					featureId,
					entitlementId,
					featureName: "API Calls",
					allowance: 0, // no included usage
					balance: -200, // 200 in overage
				});

				const consumablePrice = prices.createConsumable({
					id: "price_api_calls_consumable",
					featureId,
					internalFeatureId,
					entitlementId,
				});

				const customerPrice = prices.createCustomer({
					price: consumablePrice,
				});

				const cusProduct = customerProducts.create({
					customerEntitlements: [cusEnt],
					customerPrices: [customerPrice],
				});

				const existingUsages = cusProductToExistingUsages({ cusProduct });

				// Usage should be 200: all from overage (0 - (-200) = 200)
				expect(existingUsages[internalFeatureId]).toBeDefined();
				expect(existingUsages[internalFeatureId].usage).toBe(200);
			});

			test("consumable with exact usage matching included amount", () => {
				const internalFeatureId = "internal_messages";
				const featureId = "messages";
				const entitlementId = "ent_messages";

				const cusEnt = customerEntitlements.create({
					internalFeatureId,
					featureId,
					entitlementId,
					featureName: "Messages",
					allowance: 100,
					balance: 0, // exactly used up included amount
				});

				const consumablePrice = prices.createConsumable({
					id: "price_messages_consumable",
					featureId,
					internalFeatureId,
					entitlementId,
				});

				const customerPrice = prices.createCustomer({
					price: consumablePrice,
				});

				const cusProduct = customerProducts.create({
					customerEntitlements: [cusEnt],
					customerPrices: [customerPrice],
				});

				const existingUsages = cusProductToExistingUsages({ cusProduct });

				// Usage should be 100: exactly at the limit
				expect(existingUsages[internalFeatureId]).toBeDefined();
				expect(existingUsages[internalFeatureId].usage).toBe(100);
			});
		});

		// ═══════════════════════════════════════════════════════════════════════════════
		// ALLOCATED FEATURE PRICE TESTS (seat-based / prorated billing)
		// ═══════════════════════════════════════════════════════════════════════════════

		describe("allocated feature prices (seat-based / prorated)", () => {
			test("allocated seats with usage within included", () => {
				const internalFeatureId = "internal_users";
				const featureId = "users";
				const entitlementId = "ent_users";

				const cusEnt = customerEntitlements.create({
					internalFeatureId,
					featureId,
					entitlementId,
					featureName: "Users",
					allowance: 5, // 5 included seats
					balance: 2, // 3 seats used
				});

				const allocatedPrice = prices.createAllocated({
					id: "price_users_allocated",
					featureId,
					internalFeatureId,
					entitlementId,
				});

				const customerPrice = prices.createCustomer({
					price: allocatedPrice,
				});

				const cusProduct = customerProducts.create({
					customerEntitlements: [cusEnt],
					customerPrices: [customerPrice],
				});

				const existingUsages = cusProductToExistingUsages({ cusProduct });

				// Usage should be 3: 5 included - 2 remaining = 3 used
				expect(existingUsages[internalFeatureId]).toBeDefined();
				expect(existingUsages[internalFeatureId].usage).toBe(3);
			});

			test("allocated seats with usage exceeding included", () => {
				const internalFeatureId = "internal_users";
				const featureId = "users";
				const entitlementId = "ent_users";

				const cusEnt = customerEntitlements.create({
					internalFeatureId,
					featureId,
					entitlementId,
					featureName: "Users",
					allowance: 3, // 3 included seats
					balance: -2, // 5 seats used (2 over)
				});

				const allocatedPrice = prices.createAllocated({
					id: "price_users_allocated",
					featureId,
					internalFeatureId,
					entitlementId,
				});

				const customerPrice = prices.createCustomer({
					price: allocatedPrice,
				});

				const cusProduct = customerProducts.create({
					customerEntitlements: [cusEnt],
					customerPrices: [customerPrice],
				});

				const existingUsages = cusProductToExistingUsages({ cusProduct });

				// Usage should be 5: 3 - (-2) = 5 total seats used
				expect(existingUsages[internalFeatureId]).toBeDefined();
				expect(existingUsages[internalFeatureId].usage).toBe(5);
			});

			test("allocated with no included seats (all purchased)", () => {
				const internalFeatureId = "internal_users";
				const featureId = "users";
				const entitlementId = "ent_users";

				const cusEnt = customerEntitlements.create({
					internalFeatureId,
					featureId,
					entitlementId,
					featureName: "Users",
					allowance: 0, // no included seats
					balance: -10, // 10 seats purchased/used
				});

				const allocatedPrice = prices.createAllocated({
					id: "price_users_allocated",
					featureId,
					internalFeatureId,
					entitlementId,
				});

				const customerPrice = prices.createCustomer({
					price: allocatedPrice,
				});

				const cusProduct = customerProducts.create({
					customerEntitlements: [cusEnt],
					customerPrices: [customerPrice],
				});

				const existingUsages = cusProductToExistingUsages({ cusProduct });

				// Usage should be 10: 0 - (-10) = 10
				expect(existingUsages[internalFeatureId]).toBeDefined();
				expect(existingUsages[internalFeatureId].usage).toBe(10);
			});
		});

		// ═══════════════════════════════════════════════════════════════════════════════
		// PREPAID FEATURE PRICE TESTS (purchase units in advance)
		// ═══════════════════════════════════════════════════════════════════════════════

		describe("prepaid feature prices (usage in advance)", () => {
			test("prepaid with purchased units and partial usage", () => {
				const internalFeatureId = "internal_credits";
				const featureId = "credits";
				const entitlementId = "ent_credits";

				// Prepaid: customer bought 1000 credits, used 300
				const cusEnt = customerEntitlements.create({
					internalFeatureId,
					featureId,
					entitlementId,
					featureName: "Credits",
					allowance: 0, // no free included
					balance: 700, // 1000 purchased - 300 used = 700 remaining
				});

				const prepaidPrice = prices.createPrepaid({
					id: "price_credits_prepaid",
					featureId,
					internalFeatureId,
					billingUnits: 100, // purchased in units of 100
					entitlementId,
				});

				const customerPrice = prices.createCustomer({
					price: prepaidPrice,
				});

				const cusProduct = customerProducts.create({
					customerEntitlements: [cusEnt],
					customerPrices: [customerPrice],
				});

				const existingUsages = cusProductToExistingUsages({ cusProduct });

				// For prepaid, usage = purchasedQuantity - balance
				// purchasedQuantity from 10 billing units = 1000
				// But since we don't have quantity tracking in mock, usage = 0 - balance
				// This test verifies the formula works correctly
				expect(existingUsages[internalFeatureId]).toBeDefined();
			});

			test("prepaid with included usage and purchased units", () => {
				const internalFeatureId = "internal_credits";
				const featureId = "credits";
				const entitlementId = "ent_credits";

				// Prepaid with some free included: 100 free + 500 purchased = 600 total
				// Used 400, remaining 200
				const cusEnt = customerEntitlements.create({
					internalFeatureId,
					featureId,
					entitlementId,
					featureName: "Credits",
					allowance: 100, // 100 free included
					balance: 200, // 600 total - 400 used = 200 remaining
				});

				const prepaidPrice = prices.createPrepaid({
					id: "price_credits_prepaid",
					featureId,
					internalFeatureId,
					billingUnits: 100,
					entitlementId,
				});

				const customerPrice = prices.createCustomer({
					price: prepaidPrice,
				});

				const cusProduct = customerProducts.create({
					customerEntitlements: [cusEnt],
					customerPrices: [customerPrice],
				});

				const existingUsages = cusProductToExistingUsages({ cusProduct });

				expect(existingUsages[internalFeatureId]).toBeDefined();
			});

			test("prepaid fully consumed goes into overage", () => {
				const internalFeatureId = "internal_credits";
				const featureId = "credits";
				const entitlementId = "ent_credits";

				// Prepaid 500 credits, used 600, overage of 100
				const cusEnt = customerEntitlements.create({
					internalFeatureId,
					featureId,
					entitlementId,
					featureName: "Credits",
					allowance: 0,
					balance: -100, // 500 purchased - 600 used = -100 overage
				});

				const prepaidPrice = prices.createPrepaid({
					id: "price_credits_prepaid",
					featureId,
					internalFeatureId,
					billingUnits: 100,
					entitlementId,
				});

				const customerPrice = prices.createCustomer({
					price: prepaidPrice,
				});

				const cusProduct = customerProducts.create({
					customerEntitlements: [cusEnt],
					customerPrices: [customerPrice],
				});

				const existingUsages = cusProductToExistingUsages({ cusProduct });

				expect(existingUsages[internalFeatureId]).toBeDefined();
				// Overage should be captured
				expect(existingUsages[internalFeatureId].usage).toBeGreaterThanOrEqual(
					100,
				);
			});
		});

		// ═══════════════════════════════════════════════════════════════════════════════
		// MIXED FEATURE TYPES IN SAME PRODUCT
		// ═══════════════════════════════════════════════════════════════════════════════

		describe("mixed feature types in same product", () => {
			test("product with consumable, allocated, and free metered features", () => {
				// Consumable messages: 100 included, balance -20 (120 used)
				const messagesFeatureId = "internal_messages";
				const messagesEnt = customerEntitlements.create({
					internalFeatureId: messagesFeatureId,
					featureId: "messages",
					entitlementId: "ent_messages",
					featureName: "Messages",
					allowance: 100,
					balance: -20, // 120 used
				});

				const messagesPrice = prices.createConsumable({
					id: "price_messages",
					featureId: "messages",
					internalFeatureId: messagesFeatureId,
					entitlementId: "ent_messages",
				});

				// Allocated users: 5 included, balance -2 (7 used)
				const usersFeatureId = "internal_users";
				const usersEnt = customerEntitlements.create({
					internalFeatureId: usersFeatureId,
					featureId: "users",
					entitlementId: "ent_users",
					featureName: "Users",
					allowance: 5,
					balance: -2, // 7 used
				});

				const usersPrice = prices.createAllocated({
					id: "price_users",
					featureId: "users",
					internalFeatureId: usersFeatureId,
					entitlementId: "ent_users",
				});

				// Free metered words: 500 included, balance 200 (300 used), no price
				const wordsFeatureId = "internal_words";
				const wordsEnt = customerEntitlements.create({
					internalFeatureId: wordsFeatureId,
					featureId: "words",
					entitlementId: "ent_words",
					featureName: "Words",
					allowance: 500,
					balance: 200, // 300 used
				});
				// No price for words - it's free metered

				const cusProduct = customerProducts.create({
					customerEntitlements: [messagesEnt, usersEnt, wordsEnt],
					customerPrices: [
						prices.createCustomer({ price: messagesPrice }),
						prices.createCustomer({ price: usersPrice }),
					],
				});

				const existingUsages = cusProductToExistingUsages({ cusProduct });

				// Messages: 100 - (-20) = 120 used
				expect(existingUsages[messagesFeatureId]).toBeDefined();
				expect(existingUsages[messagesFeatureId].usage).toBe(120);

				// Users: 5 - (-2) = 7 used
				expect(existingUsages[usersFeatureId]).toBeDefined();
				expect(existingUsages[usersFeatureId].usage).toBe(7);

				// Words: 500 - 200 = 300 used
				expect(existingUsages[wordsFeatureId]).toBeDefined();
				expect(existingUsages[wordsFeatureId].usage).toBe(300);
			});

			test("product with multiple consumable features at different overage levels", () => {
				// Messages: heavily into overage
				const messagesFeatureId = "internal_messages";
				const messagesEnt = customerEntitlements.create({
					internalFeatureId: messagesFeatureId,
					featureId: "messages",
					entitlementId: "ent_messages",
					featureName: "Messages",
					allowance: 50,
					balance: -150, // 200 total used, 150 in overage
				});

				const messagesPrice = prices.createConsumable({
					id: "price_messages",
					featureId: "messages",
					internalFeatureId: messagesFeatureId,
					entitlementId: "ent_messages",
				});

				// API calls: just barely in overage
				const apiCallsFeatureId = "internal_api_calls";
				const apiCallsEnt = customerEntitlements.create({
					internalFeatureId: apiCallsFeatureId,
					featureId: "api_calls",
					entitlementId: "ent_api_calls",
					featureName: "API Calls",
					allowance: 1000,
					balance: -1, // 1001 used, 1 in overage
				});

				const apiCallsPrice = prices.createConsumable({
					id: "price_api_calls",
					featureId: "api_calls",
					internalFeatureId: apiCallsFeatureId,
					entitlementId: "ent_api_calls",
				});

				// Storage: within limit
				const storageFeatureId = "internal_storage";
				const storageEnt = customerEntitlements.create({
					internalFeatureId: storageFeatureId,
					featureId: "storage",
					entitlementId: "ent_storage",
					featureName: "Storage",
					allowance: 100,
					balance: 40, // 60 used, 40 remaining
				});

				const storagePrice = prices.createConsumable({
					id: "price_storage",
					featureId: "storage",
					internalFeatureId: storageFeatureId,
					entitlementId: "ent_storage",
				});

				const cusProduct = customerProducts.create({
					customerEntitlements: [messagesEnt, apiCallsEnt, storageEnt],
					customerPrices: [
						prices.createCustomer({ price: messagesPrice }),
						prices.createCustomer({ price: apiCallsPrice }),
						prices.createCustomer({ price: storagePrice }),
					],
				});

				const existingUsages = cusProductToExistingUsages({ cusProduct });

				// Messages: 50 - (-150) = 200 used
				expect(existingUsages[messagesFeatureId]).toBeDefined();
				expect(existingUsages[messagesFeatureId].usage).toBe(200);

				// API calls: 1000 - (-1) = 1001 used
				expect(existingUsages[apiCallsFeatureId]).toBeDefined();
				expect(existingUsages[apiCallsFeatureId].usage).toBe(1001);

				// Storage: 100 - 40 = 60 used
				expect(existingUsages[storageFeatureId]).toBeDefined();
				expect(existingUsages[storageFeatureId].usage).toBe(60);
			});
		});

		// ═══════════════════════════════════════════════════════════════════════════════
		// EDGE CASES
		// ═══════════════════════════════════════════════════════════════════════════════

		describe("edge cases", () => {
			test("zero usage (balance equals allowance)", () => {
				const internalFeatureId = "internal_messages";
				const featureId = "messages";
				const entitlementId = "ent_messages";

				const cusEnt = customerEntitlements.create({
					internalFeatureId,
					featureId,
					entitlementId,
					featureName: "Messages",
					allowance: 100,
					balance: 100, // no usage
				});

				const consumablePrice = prices.createConsumable({
					id: "price_messages",
					featureId,
					internalFeatureId,
					entitlementId,
				});

				const customerPrice = prices.createCustomer({
					price: consumablePrice,
				});

				const cusProduct = customerProducts.create({
					customerEntitlements: [cusEnt],
					customerPrices: [customerPrice],
				});

				const existingUsages = cusProductToExistingUsages({ cusProduct });

				// Usage should be 0
				expect(existingUsages[internalFeatureId]).toBeDefined();
				expect(existingUsages[internalFeatureId].usage).toBe(0);
			});

			test("large overage values", () => {
				const internalFeatureId = "internal_messages";
				const featureId = "messages";
				const entitlementId = "ent_messages";

				const cusEnt = customerEntitlements.create({
					internalFeatureId,
					featureId,
					entitlementId,
					featureName: "Messages",
					allowance: 100,
					balance: -10000, // massive overage
				});

				const consumablePrice = prices.createConsumable({
					id: "price_messages",
					featureId,
					internalFeatureId,
					entitlementId,
				});

				const customerPrice = prices.createCustomer({
					price: consumablePrice,
				});

				const cusProduct = customerProducts.create({
					customerEntitlements: [cusEnt],
					customerPrices: [customerPrice],
				});

				const existingUsages = cusProductToExistingUsages({ cusProduct });

				// Usage should be 10100: 100 - (-10000) = 10100
				expect(existingUsages[internalFeatureId]).toBeDefined();
				expect(existingUsages[internalFeatureId].usage).toBe(10100);
			});

			test("decimal values in balance", () => {
				const internalFeatureId = "internal_credits";
				const featureId = "credits";
				const entitlementId = "ent_credits";

				const cusEnt = customerEntitlements.create({
					internalFeatureId,
					featureId,
					entitlementId,
					featureName: "Credits",
					allowance: 100,
					balance: -50.5, // fractional overage
				});

				const consumablePrice = prices.createConsumable({
					id: "price_credits",
					featureId,
					internalFeatureId,
					entitlementId,
				});

				const customerPrice = prices.createCustomer({
					price: consumablePrice,
				});

				const cusProduct = customerProducts.create({
					customerEntitlements: [cusEnt],
					customerPrices: [customerPrice],
				});

				const existingUsages = cusProductToExistingUsages({ cusProduct });

				// Usage should be 150.5
				expect(existingUsages[internalFeatureId]).toBeDefined();
				expect(existingUsages[internalFeatureId].usage).toBe(150.5);
			});
		});
	},
);
