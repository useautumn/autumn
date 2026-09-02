/**
 * Save-time rules for credit dimensions, applied through validateCreditSystem
 * so feature-level and plan-item overrides get the same bar:
 * - every dimension is a well-formed flat or graduated rate;
 * - two dimensions that could both win the same event must be separable by
 *   key count or priority;
 * - multipliers cannot push any rate below zero.
 */

import { describe, expect, test } from "bun:test";
import {
	type CreditMultiplier,
	type CreditSchemaItem,
	type CreditSystemConfig,
	FeatureUsageType,
} from "@autumn/shared";
import { validateCreditSystem } from "@/internal/features/featureUtils.js";

const validate = (item: Partial<CreditSchemaItem>) =>
	validateCreditSystem({
		usage_type: FeatureUsageType.Single,
		schema: [{ metered_feature_id: "cpu_minutes", credit_amount: 1, ...item }],
	} as CreditSystemConfig);

const expectRejected = (item: Partial<CreditSchemaItem>, message: RegExp) =>
	expect(() => validate(item)).toThrow(message);

describe("credit dimension validation", () => {
	test("accepts a card with specific and general dimensions and stacked multipliers", () => {
		const config = validate({
			dimensions: {
				large: { match: { size: "large" }, credit_amount: 16 },
				large_eu: {
					match: { size: "large", region: "eu" },
					credit_amount: 20,
				},
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
			},
		});

		expect(config.schema[0]?.dimensions?.large_eu).toEqual({
			match: { size: "large", region: "eu" },
			credit_amount: 20,
		});
	});

	test("coerces numeric strings inside dimension rates like the row", () => {
		const config = validate({
			dimensions: {
				small: {
					match: { size: "small" },
					credit_amount: "2" as unknown as number,
				},
			},
		});

		expect(config.schema[0]?.dimensions?.small).toEqual({
			match: { size: "small" },
			credit_amount: 2,
		});
	});

	test("rejects a dimension with a negative rate", () => {
		expectRejected(
			{
				dimensions: { small: { match: { size: "small" }, credit_amount: -1 } },
			},
			/zero or greater/,
		);
	});

	test("rejects a graduated dimension without a terminal infinity tier", () => {
		expectRejected(
			{
				dimensions: {
					xl: {
						match: { size: "xl" },
						tier_behavior: "graduated",
						tiers: [{ to: 1_000, credit_amount: 30 }],
					},
				},
			},
			/infinity boundary/,
		);
	});

	test("rejects two same-specificity dimensions that could both match one event", () => {
		expectRejected(
			{
				dimensions: {
					large: { match: { size: "large" }, credit_amount: 16 },
					eu: { match: { region: "eu" }, credit_amount: 12 },
				},
			},
			/large.*eu|eu.*large/,
		);
	});

	test("accepts the same pair once a priority separates them", () => {
		expect(() =>
			validate({
				dimensions: {
					large: { match: { size: "large" }, credit_amount: 16 },
					eu: { match: { region: "eu" }, priority: 1, credit_amount: 12 },
				},
			}),
		).not.toThrow();
	});

	test("same-specificity dimensions with conflicting values never overlap", () => {
		expect(() =>
			validate({
				dimensions: {
					small: { match: { size: "small" }, credit_amount: 1 },
					large: { match: { size: "large" }, credit_amount: 16 },
				},
			}),
		).not.toThrow();
	});

	test("rejects a multiplier that can push the cheapest rate below zero", () => {
		expectRejected(
			{
				dimensions: {
					small: { match: { size: "small" }, credit_amount: 0.5 },
				},
				multipliers: {
					spot: { match: { lifecycle: "spot" }, factor: 0.5 },
					promo: { match: { cohort: "2024" }, add: -0.3 },
				},
			},
			/below zero/,
		);
	});

	test("rejects a multiplier with a non-positive factor or nothing to apply", () => {
		expectRejected(
			{ multipliers: { spot: { match: { lifecycle: "spot" }, factor: 0 } } },
			/factor/,
		);
		expectRejected(
			{
				multipliers: {
					spot: { match: { lifecycle: "spot" } } as unknown as CreditMultiplier,
				},
			},
			/factor or an add/,
		);
	});
});
