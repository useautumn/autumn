import { describe, expect, test } from "bun:test";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts";
import { prices } from "@tests/utils/fixtures/db/prices";
import chalk from "chalk";
import { cusProductToExistingUsages } from "@/internal/billing/v2/utils/handleExistingUsages/cusProductToExistingUsages";

describe(
	chalk.yellowBright("cusProductToExistingUsages - paid features"),
	() => {
		describe("consumable feature prices (overage billing)", () => {
			test("consumable with usage into overage calculates correct usage", () => {
				const internalFeatureId = "internal_messages";
				const featureId = "messages";
				const entitlementId = "ent_messages";

				const cusEnt = customerEntitlements.create({
					internalFeatureId,
					featureId,
					entitlementId,
					featureName: "Messages",
					allowance: 100,
					balance: -50,
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

				const existingUsages = cusProductToExistingUsages({
					cusProduct,
					carryAllConsumableFeatures: true,
				});

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
					allowance: 100,
					balance: 30,
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

				const existingUsages = cusProductToExistingUsages({
					cusProduct,
					carryAllConsumableFeatures: true,
				});

				expect(existingUsages[internalFeatureId]).toBeDefined();
				expect(existingUsages[internalFeatureId].usage).toBe(70);
			});

			test("consumable with zero included usage and overage", () => {
				const internalFeatureId = "internal_api_calls";
				const featureId = "api_calls";
				const entitlementId = "ent_api_calls";

				const cusEnt = customerEntitlements.create({
					internalFeatureId,
					featureId,
					entitlementId,
					featureName: "API Calls",
					allowance: 0,
					balance: -200,
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

				const existingUsages = cusProductToExistingUsages({
					cusProduct,
					carryAllConsumableFeatures: true,
				});

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
					balance: 0,
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

				const existingUsages = cusProductToExistingUsages({
					cusProduct,
					carryAllConsumableFeatures: true,
				});

				expect(existingUsages[internalFeatureId]).toBeDefined();
				expect(existingUsages[internalFeatureId].usage).toBe(100);
			});
		});

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
					allowance: 5,
					balance: 2,
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

				const existingUsages = cusProductToExistingUsages({
					cusProduct,
					carryAllConsumableFeatures: true,
				});

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
					allowance: 3,
					balance: -2,
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

				const existingUsages = cusProductToExistingUsages({
					cusProduct,
					carryAllConsumableFeatures: true,
				});

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
					allowance: 0,
					balance: -10,
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

				const existingUsages = cusProductToExistingUsages({
					cusProduct,
					carryAllConsumableFeatures: true,
				});

				expect(existingUsages[internalFeatureId]).toBeDefined();
				expect(existingUsages[internalFeatureId].usage).toBe(10);
			});
		});

		describe("prepaid feature prices (usage in advance)", () => {
			test("prepaid with purchased units and partial usage", () => {
				const internalFeatureId = "internal_credits";
				const featureId = "credits";
				const entitlementId = "ent_credits";

				const cusEnt = customerEntitlements.create({
					internalFeatureId,
					featureId,
					entitlementId,
					featureName: "Credits",
					allowance: 0,
					balance: 700,
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

				const existingUsages = cusProductToExistingUsages({
					cusProduct,
					carryAllConsumableFeatures: true,
				});

				expect(existingUsages[internalFeatureId]).toBeDefined();
			});

			test("prepaid with included usage and purchased units", () => {
				const internalFeatureId = "internal_credits";
				const featureId = "credits";
				const entitlementId = "ent_credits";

				const cusEnt = customerEntitlements.create({
					internalFeatureId,
					featureId,
					entitlementId,
					featureName: "Credits",
					allowance: 100,
					balance: 200,
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

				const existingUsages = cusProductToExistingUsages({
					cusProduct,
					carryAllConsumableFeatures: true,
				});

				expect(existingUsages[internalFeatureId]).toBeDefined();
			});

			test("prepaid fully consumed goes into overage", () => {
				const internalFeatureId = "internal_credits";
				const featureId = "credits";
				const entitlementId = "ent_credits";

				const cusEnt = customerEntitlements.create({
					internalFeatureId,
					featureId,
					entitlementId,
					featureName: "Credits",
					allowance: 0,
					balance: -100,
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

				const existingUsages = cusProductToExistingUsages({
					cusProduct,
					carryAllConsumableFeatures: true,
				});

				expect(existingUsages[internalFeatureId]).toBeDefined();
				expect(existingUsages[internalFeatureId].usage).toBeGreaterThanOrEqual(
					100,
				);
			});
		});

		describe("mixed feature types in same product", () => {
			test("product with consumable, allocated, and free metered features", () => {
				const messagesFeatureId = "internal_messages";
				const messagesEnt = customerEntitlements.create({
					internalFeatureId: messagesFeatureId,
					featureId: "messages",
					entitlementId: "ent_messages",
					featureName: "Messages",
					allowance: 100,
					balance: -20,
				});

				const messagesPrice = prices.createConsumable({
					id: "price_messages",
					featureId: "messages",
					internalFeatureId: messagesFeatureId,
					entitlementId: "ent_messages",
				});

				const usersFeatureId = "internal_users";
				const usersEnt = customerEntitlements.create({
					internalFeatureId: usersFeatureId,
					featureId: "users",
					entitlementId: "ent_users",
					featureName: "Users",
					allowance: 5,
					balance: -2,
				});

				const usersPrice = prices.createAllocated({
					id: "price_users",
					featureId: "users",
					internalFeatureId: usersFeatureId,
					entitlementId: "ent_users",
				});

				const wordsFeatureId = "internal_words";
				const wordsEnt = customerEntitlements.create({
					internalFeatureId: wordsFeatureId,
					featureId: "words",
					entitlementId: "ent_words",
					featureName: "Words",
					allowance: 500,
					balance: 200,
				});

				const cusProduct = customerProducts.create({
					customerEntitlements: [messagesEnt, usersEnt, wordsEnt],
					customerPrices: [
						prices.createCustomer({ price: messagesPrice }),
						prices.createCustomer({ price: usersPrice }),
					],
				});

				const existingUsages = cusProductToExistingUsages({
					cusProduct,
					carryAllConsumableFeatures: true,
				});

				expect(existingUsages[messagesFeatureId]).toBeDefined();
				expect(existingUsages[messagesFeatureId].usage).toBe(120);

				expect(existingUsages[usersFeatureId]).toBeDefined();
				expect(existingUsages[usersFeatureId].usage).toBe(7);

				expect(existingUsages[wordsFeatureId]).toBeDefined();
				expect(existingUsages[wordsFeatureId].usage).toBe(300);
			});

			test("product with multiple consumable features at different overage levels", () => {
				const messagesFeatureId = "internal_messages";
				const messagesEnt = customerEntitlements.create({
					internalFeatureId: messagesFeatureId,
					featureId: "messages",
					entitlementId: "ent_messages",
					featureName: "Messages",
					allowance: 50,
					balance: -150,
				});

				const messagesPrice = prices.createConsumable({
					id: "price_messages",
					featureId: "messages",
					internalFeatureId: messagesFeatureId,
					entitlementId: "ent_messages",
				});

				const apiCallsFeatureId = "internal_api_calls";
				const apiCallsEnt = customerEntitlements.create({
					internalFeatureId: apiCallsFeatureId,
					featureId: "api_calls",
					entitlementId: "ent_api_calls",
					featureName: "API Calls",
					allowance: 1000,
					balance: -1,
				});

				const apiCallsPrice = prices.createConsumable({
					id: "price_api_calls",
					featureId: "api_calls",
					internalFeatureId: apiCallsFeatureId,
					entitlementId: "ent_api_calls",
				});

				const storageFeatureId = "internal_storage";
				const storageEnt = customerEntitlements.create({
					internalFeatureId: storageFeatureId,
					featureId: "storage",
					entitlementId: "ent_storage",
					featureName: "Storage",
					allowance: 100,
					balance: 40,
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

				const existingUsages = cusProductToExistingUsages({
					cusProduct,
					carryAllConsumableFeatures: true,
				});

				expect(existingUsages[messagesFeatureId]).toBeDefined();
				expect(existingUsages[messagesFeatureId].usage).toBe(200);

				expect(existingUsages[apiCallsFeatureId]).toBeDefined();
				expect(existingUsages[apiCallsFeatureId].usage).toBe(1001);

				expect(existingUsages[storageFeatureId]).toBeDefined();
				expect(existingUsages[storageFeatureId].usage).toBe(60);
			});
		});

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
					balance: 100,
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

				const existingUsages = cusProductToExistingUsages({
					cusProduct,
					carryAllConsumableFeatures: true,
				});

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
					balance: -10000,
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

				const existingUsages = cusProductToExistingUsages({
					cusProduct,
					carryAllConsumableFeatures: true,
				});

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
					balance: -50.5,
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

				const existingUsages = cusProductToExistingUsages({
					cusProduct,
					carryAllConsumableFeatures: true,
				});

				expect(existingUsages[internalFeatureId]).toBeDefined();
				expect(existingUsages[internalFeatureId].usage).toBe(150.5);
			});
		});
	},
);
