import { describe, expect, test } from "bun:test";
import { EntInterval, type ExistingUsages } from "@autumn/shared";
import { contexts } from "@tests/utils/fixtures/db/contexts";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts";
import chalk from "chalk";
import { applyExistingUsages } from "@/internal/billing/v2/utils/handleExistingUsages/applyExistingUsages";

const ctx = contexts.create({});

describe(
	chalk.yellowBright("applyExistingUsages (testing deduction order)"),
	() => {
		describe("interval-based deduction order", () => {
			test("monthly cusEnt is deducted before lifetime cusEnt", () => {
				const internalFeatureId = "internal_feature_a";

				const lifetimeCusEnt = customerEntitlements.create({
					internalFeatureId,
					featureId: "feature_a",
					featureName: "Feature A",
					allowance: 5,
					balance: 5,
					interval: EntInterval.Lifetime,
				});

				const monthlyCusEnt = customerEntitlements.create({
					internalFeatureId,
					featureId: "feature_a",
					featureName: "Feature A",
					allowance: 5,
					balance: 5,
					interval: EntInterval.Month,
					nextResetAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
				});

				const cusProduct = customerProducts.create({
					customerEntitlements: [monthlyCusEnt, lifetimeCusEnt],
				});

				const existingUsages: ExistingUsages = {
					[internalFeatureId]: { usage: 7, entityUsages: {} },
				};

				applyExistingUsages({
					ctx,
					customerProduct: cusProduct,
					existingUsages,
					entities: [],
				});

				const updatedLifetime = cusProduct.customer_entitlements.find(
					(ce) => ce.entitlement.interval === EntInterval.Lifetime,
				);
				const updatedMonthly = cusProduct.customer_entitlements.find(
					(ce) => ce.entitlement.interval === EntInterval.Month,
				);

				expect(updatedMonthly?.balance).toBe(0);
				expect(updatedLifetime?.balance).toBe(3);
			});
		});

		describe("usage_allowed-based deduction order", () => {
			test("prepaid cusEnt (usage_allowed=false) is deducted before pay-per-use cusEnt (usage_allowed=true)", () => {
				const internalFeatureId = "internal_feature_a";

				const prepaidCusEnt = customerEntitlements.create({
					internalFeatureId,
					featureId: "feature_a",
					featureName: "Feature A",
					allowance: 5,
					balance: 5,
					usageAllowed: false,
				});

				const payPerUseCusEnt = customerEntitlements.create({
					internalFeatureId,
					featureId: "feature_a",
					featureName: "Feature A",
					allowance: 5,
					balance: 5,
					usageAllowed: true,
				});

				const customerProduct = customerProducts.create({
					customerEntitlements: [payPerUseCusEnt, prepaidCusEnt],
				});

				const existingUsages: ExistingUsages = {
					[internalFeatureId]: { usage: 7, entityUsages: {} },
				};

				applyExistingUsages({
					ctx,
					customerProduct,
					existingUsages,
					entities: [],
				});

				const updatedPrepaid = customerProduct.customer_entitlements.find(
					(ce) => ce.usage_allowed === false,
				);
				const updatedPayPerUse = customerProduct.customer_entitlements.find(
					(ce) => ce.usage_allowed === true,
				);

				expect(updatedPrepaid?.balance).toBe(0);
				expect(updatedPayPerUse?.balance).toBe(3);
			});
		});

		describe("negative balance deduction", () => {
			test("prepaid monthly is deducted to 0, pay-per-use monthly goes negative", () => {
				const internalFeatureId = "internal_feature_a";

				const prepaidMonthly = customerEntitlements.create({
					internalFeatureId,
					featureId: "feature_a",
					featureName: "Feature A",
					allowance: 5,
					balance: 5,
					usageAllowed: false,
					interval: EntInterval.Month,
					nextResetAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
				});

				const payPerUseMonthly = customerEntitlements.create({
					internalFeatureId,
					featureId: "feature_a",
					featureName: "Feature A",
					allowance: 5,
					balance: 5,
					usageAllowed: true,
					interval: EntInterval.Month,
					nextResetAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
				});

				const customerProduct = customerProducts.create({
					customerEntitlements: [payPerUseMonthly, prepaidMonthly],
				});

				const existingUsages: ExistingUsages = {
					[internalFeatureId]: { usage: 12, entityUsages: {} },
				};

				applyExistingUsages({
					ctx,
					customerProduct,
					existingUsages,
					entities: [],
				});

				const updatedPrepaid = customerProduct.customer_entitlements.find(
					(ce) => ce.usage_allowed === false,
				);
				const updatedPayPerUse = customerProduct.customer_entitlements.find(
					(ce) => ce.usage_allowed === true,
				);

				expect(updatedPrepaid?.balance).toBe(0);
				expect(updatedPayPerUse?.balance).toBe(-2);
			});
		});

		describe("combined ordering", () => {
			test("prepaid monthly -> prepaid lifetime -> pay-per-use monthly", () => {
				const internalFeatureId = "internal_feature_a";

				const prepaidMonthly = customerEntitlements.create({
					internalFeatureId,
					featureId: "feature_a",
					featureName: "Feature A",
					allowance: 2,
					balance: 2,
					usageAllowed: false,
					interval: EntInterval.Month,
					nextResetAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
				});

				const prepaidLifetime = customerEntitlements.create({
					internalFeatureId,
					featureId: "feature_a",
					featureName: "Feature A",
					allowance: 2,
					balance: 2,
					usageAllowed: false,
					interval: EntInterval.Lifetime,
				});

				const payPerUseMonthly = customerEntitlements.create({
					internalFeatureId,
					featureId: "feature_a",
					featureName: "Feature A",
					allowance: 2,
					balance: 2,
					usageAllowed: true,
					interval: EntInterval.Month,
					nextResetAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
				});

				const customerProduct = customerProducts.create({
					customerEntitlements: [
						payPerUseMonthly,
						prepaidLifetime,
						prepaidMonthly,
					],
				});

				const existingUsages: ExistingUsages = {
					[internalFeatureId]: { usage: 5, entityUsages: {} },
				};

				applyExistingUsages({
					ctx,
					customerProduct,
					existingUsages,
					entities: [],
				});

				const findCusEnt = (usageAllowed: boolean, interval: EntInterval) =>
					customerProduct.customer_entitlements.find(
						(ce) =>
							ce.usage_allowed === usageAllowed &&
							ce.entitlement.interval === interval,
					);

				const updatedPrepaidMonthly = findCusEnt(false, EntInterval.Month);
				const updatedPrepaidLifetime = findCusEnt(false, EntInterval.Lifetime);
				const updatedPayPerUseMonthly = findCusEnt(true, EntInterval.Month);

				expect(updatedPrepaidMonthly?.balance).toBe(0);
				expect(updatedPayPerUseMonthly?.balance).toBe(0);
				expect(updatedPrepaidLifetime?.balance).toBe(1);
			});
		});
	},
);
