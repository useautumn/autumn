/**
 * Runtime contract for credit dimensions: the most specific matching dimension
 * sets the rate (else the row's), every matching multiplier scales it, and the
 * result is an ordinary flat or graduated item the existing cost math consumes.
 */

import { describe, expect, test } from "bun:test";
import {
	type CreditSchemaItem,
	type Feature,
	FeatureType,
	FeatureUsageType,
	type FullCusEntWithFullCusProduct,
} from "@autumn/shared";
import { computeCreditCosts } from "@/internal/balances/utils/deduction/computeCreditCosts.js";
import { resolveCreditDimensionRate } from "@/internal/features/creditDimensions/resolveCreditDimensionRate.js";
import {
	getCreditCost,
	getCreditRateCard,
} from "@/internal/features/creditSystemUtils.js";

const row: CreditSchemaItem = {
	metered_feature_id: "cpu_minutes",
	credit_amount: 1,
	dimensions: {
		small: { match: { size: "small" }, credit_amount: 1 },
		large: { match: { size: "large" }, credit_amount: 16 },
		large_eu: {
			match: { size: "large", region: "eu" },
			credit_amount: 20,
		},
		eu: { match: { region: "eu" }, priority: 1, credit_amount: 12 },
		xl: {
			match: { size: "xl" },
			tier_behavior: "graduated",
			tiers: [
				{ to: 1_000, credit_amount: 30 },
				{ to: "inf", credit_amount: 25 },
			],
		},
	},
	multipliers: {
		spot: { match: { lifecycle: "spot" }, factor: 0.3 },
		promo: { match: { cohort: "2024" }, add: -0.2 },
		everyone: { match: {}, factor: 1 },
	},
};

const resolve = (eventProperties?: Record<string, unknown>) =>
	resolveCreditDimensionRate({
		schemaItem: row,
		eventProperties,
		creditSystemId: "credits",
	});

describe("resolveCreditDimensionRate", () => {
	test("the most specific dimension wins and names the attribution", () => {
		expect(resolve({ size: "large", region: "eu" })).toEqual({
			metered_feature_id: "cpu_minutes",
			dimension_name: "large_eu",
			credit_amount: 20,
		});
	});

	test("priority breaks a tie between equally specific dimensions", () => {
		expect(resolve({ size: "small", region: "eu" })).toMatchObject({
			dimension_name: "eu",
			credit_amount: 12,
		});
	});

	test("no match falls back to the row's rate with no dimension name", () => {
		expect(resolve({ size: "xxl" })).toEqual({
			metered_feature_id: "cpu_minutes",
			credit_amount: 1,
		});
		expect(resolve(undefined)).toEqual({
			metered_feature_id: "cpu_minutes",
			credit_amount: 1,
		});
	});

	test("multipliers stack: factors multiply, then adds are summed", () => {
		expect(
			resolve({ size: "large", lifecycle: "spot", cohort: "2024" }),
		).toMatchObject({ dimension_name: "large", credit_amount: 16 * 0.3 - 0.2 });
	});

	test("a graduated dimension scales every tier and keeps its boundaries", () => {
		expect(resolve({ size: "xl", lifecycle: "spot" })).toEqual({
			metered_feature_id: "cpu_minutes",
			dimension_name: "xl",
			tier_behavior: "graduated",
			tiers: [
				{ to: 1_000, credit_amount: 9 },
				{ to: "inf", credit_amount: 7.5 },
			],
		});
	});

	test("property values are compared as strings", () => {
		const numericRow: CreditSchemaItem = {
			metered_feature_id: "cpu_minutes",
			credit_amount: 1,
			dimensions: { eight: { match: { size: "8" }, credit_amount: 8 } },
		};
		expect(
			resolveCreditDimensionRate({
				schemaItem: numericRow,
				eventProperties: { size: 8 },
				creditSystemId: "credits",
			}),
		).toMatchObject({ dimension_name: "eight" });
	});

	test("a rate that would go below zero is rejected, never clamped", () => {
		const cheapRow: CreditSchemaItem = {
			metered_feature_id: "cpu_minutes",
			credit_amount: 0.1,
			multipliers: { promo: { match: {}, add: -0.5 } },
		};
		expect(() =>
			resolveCreditDimensionRate({
				schemaItem: cheapRow,
				eventProperties: {},
				creditSystemId: "credits",
			}),
		).toThrow(/below zero/);
	});
});

const makeFeature = (
	id: string,
	type: FeatureType,
	schema: CreditSchemaItem[] = [],
): Feature => ({
	internal_id: `fe_${id}`,
	org_id: "org_test",
	created_at: 0,
	env: "sandbox" as Feature["env"],
	id,
	name: id,
	type,
	config: { schema, usage_type: FeatureUsageType.Single, invoice_credit: true },
	archived: false,
	event_names: [],
	model_markups: null,
});

const cpuMinutes = makeFeature("cpu_minutes", FeatureType.Metered);
const credits = makeFeature("credits", FeatureType.CreditSystem, [row]);

describe("credit cost through dimensions", () => {
	test("getCreditCost rates by the event's properties", () => {
		expect(
			getCreditCost({
				featureId: "cpu_minutes",
				creditSystem: credits,
				amount: 10,
				eventProperties: { size: "large", region: "eu", lifecycle: "spot" },
			}),
		).toBe(60);
		expect(
			getCreditCost({
				featureId: "cpu_minutes",
				creditSystem: credits,
				amount: 10,
			}),
		).toBe(10);
	});

	test("getCreditRateCard keys attribution by the winning dimension", () => {
		expect(
			getCreditRateCard({
				sourceFeature: cpuMinutes,
				creditSystem: credits,
				eventProperties: { size: "large", region: "eu" },
			}),
		).toEqual({
			source_internal_feature_id: "fe_cpu_minutes::large_eu",
			feature_amount: 1,
			credit_amount: 20,
		});
		expect(
			getCreditRateCard({ sourceFeature: cpuMinutes, creditSystem: credits }),
		).toMatchObject({ source_internal_feature_id: "fe_cpu_minutes" });
	});

	test("computeCreditCosts threads the event's properties to every entitlement", () => {
		const lookup = computeCreditCosts({
			cusEnts: [
				{ id: "ce_credits", entitlement: { feature: credits } },
			] as FullCusEntWithFullCusProduct[],
			deduction: { feature: cpuMinutes, deduction: 10 },
			eventProperties: { size: "xl", lifecycle: "spot" },
		});

		expect(lookup("ce_credits")).toEqual({
			creditCost: 9,
			rateCard: {
				source_internal_feature_id: "fe_cpu_minutes::xl",
				feature_amount: 1,
				tier_behavior: "graduated",
				tiers: [
					{ to: 1_000, credit_amount: 9 },
					{ to: "inf", credit_amount: 7.5 },
				],
			},
		});
	});
});
