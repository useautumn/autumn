/**
 * Contract for credit-system dimensions on a rate-card row:
 * - a row keeps its own rate and optionally carries named `dimensions`
 *   (match → rate) and `multipliers` (match → factor / add);
 * - dimension entries are full rates, flat or graduated, like the row;
 * - entry names become usage-attribution keys, so they are bounded and
 *   cannot contain the key separator.
 */

import { describe, expect, test } from "bun:test";
import {
	buildUsageAttributionKey,
	CreditDimensionSchema,
	CreditMultiplierSchema,
	type CreditSchemaItem,
	CreditSchemaItemSchema,
	parseUsageAttributionKey,
} from "@autumn/shared";

const dimensionedRow: CreditSchemaItem = {
	metered_feature_id: "cpu_minutes",
	credit_amount: 1,
	dimensions: {
		small: { match: { size: "small" }, credit_amount: 1 },
		large_eu: {
			match: { size: "large", region: "eu" },
			priority: 1,
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
};

describe("credit dimension models", () => {
	test("a row carries named dimensions and multipliers alongside its own rate", () => {
		const result = CreditSchemaItemSchema.safeParse(dimensionedRow);

		expect(result.success).toBe(true);
		if (!result.success) return;

		expect(result.data).toEqual(dimensionedRow);
	});

	test("a graduated row can carry dimensions too", () => {
		const result = CreditSchemaItemSchema.safeParse({
			metered_feature_id: "cpu_minutes",
			tier_behavior: "graduated",
			tiers: [{ to: "inf", credit_amount: 1 }],
			dimensions: dimensionedRow.dimensions,
		});

		expect(result.success).toBe(true);
	});

	test("plain rows are unchanged", () => {
		const result = CreditSchemaItemSchema.safeParse({
			metered_feature_id: "feature_a",
			credit_amount: 1,
		});

		expect(result.success).toBe(true);
		if (!result.success) return;

		expect(result.data).toEqual({
			metered_feature_id: "feature_a",
			credit_amount: 1,
		});
	});

	test("match values are stored as strings", () => {
		const result = CreditDimensionSchema.safeParse({
			match: { size: 8, gpu: true },
			credit_amount: 2,
		});

		expect(result.success).toBe(true);
		if (!result.success) return;

		expect(result.data.match).toEqual({ size: "8", gpu: "true" });
	});

	test("rejects a dimension that mixes a flat rate with graduated tiers", () => {
		const result = CreditDimensionSchema.safeParse({
			match: { size: "small" },
			credit_amount: 1,
			tier_behavior: "graduated",
			tiers: [{ to: "inf", credit_amount: 0.5 }],
		});

		expect(result.success).toBe(false);
	});

	test("rejects a multiplier with neither factor nor add", () => {
		const result = CreditMultiplierSchema.safeParse({
			match: { lifecycle: "spot" },
		});

		expect(result.success).toBe(false);
	});

	test("rejects a non-positive multiplier factor", () => {
		for (const factor of [0, -1]) {
			const result = CreditMultiplierSchema.safeParse({
				match: { lifecycle: "spot" },
				factor,
			});

			expect(result.success).toBe(false);
		}
	});

	test("rejects dimension names that cannot become attribution keys", () => {
		for (const name of ["large::eu", "x".repeat(65), ""]) {
			const result = CreditSchemaItemSchema.safeParse({
				metered_feature_id: "cpu_minutes",
				credit_amount: 1,
				dimensions: {
					[name]: { match: { size: "large" }, credit_amount: 20 },
				},
			});

			expect(result.success).toBe(false);
		}
	});
});

describe("usage attribution keys", () => {
	test("a plain source keys by its internal feature id", () => {
		const key = buildUsageAttributionKey({
			internalFeatureId: "fe_cpu",
		});

		expect(key).toBe("fe_cpu");
		expect(parseUsageAttributionKey({ key })).toEqual({
			internalFeatureId: "fe_cpu",
		});
	});

	test("a dimensioned source round-trips its entry name", () => {
		const key = buildUsageAttributionKey({
			internalFeatureId: "fe_cpu",
			dimensionName: "large_eu",
		});

		expect(key).toBe("fe_cpu::large_eu");
		expect(parseUsageAttributionKey({ key })).toEqual({
			internalFeatureId: "fe_cpu",
			dimensionName: "large_eu",
		});
	});
});
