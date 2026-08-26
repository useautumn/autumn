/**
 * Contract for the enterprise credit rate-card data model:
 * - existing flat credit-schema entries remain valid;
 * - flat entries preserve their optional per-X-unit `feature_amount`;
 * - graduated entries contain tiers instead of a flat `credit_amount`;
 * - `invoice_credit` lives on the credit feature config;
 * - customer-entitlement attribution is keyed by source internal feature ID.
 */

import { describe, expect, test } from "bun:test";
import {
	CreditSchemaItemSchema,
	CreditSystemConfigSchema,
	CustomerEntitlementSchema,
	FeatureUsageType,
} from "@autumn/shared";

const baseCreditConfig = {
	usage_type: FeatureUsageType.Single,
};

describe("enterprise credit rate-card models", () => {
	test("keeps existing flat credit schemas backward compatible", () => {
		const result = CreditSystemConfigSchema.safeParse({
			...baseCreditConfig,
			schema: [{ metered_feature_id: "feature_a", credit_amount: 1 }],
		});

		expect(result.success).toBe(true);
		if (!result.success) return;

		expect(result.data.invoice_credit).toBeUndefined();
		expect(result.data.schema).toEqual([
			{ metered_feature_id: "feature_a", credit_amount: 1 },
		]);
	});

	test("preserves per-X-unit flat rates and the invoice-credit flag", () => {
		const result = CreditSystemConfigSchema.safeParse({
			...baseCreditConfig,
			invoice_credit: true,
			schema: [
				{
					metered_feature_id: "feature_a",
					feature_amount: 100,
					credit_amount: 1,
				},
			],
		});

		expect(result.success).toBe(true);
		if (!result.success) return;

		expect(result.data.invoice_credit).toBe(true);
		expect(result.data.schema[0]).toEqual({
			metered_feature_id: "feature_a",
			feature_amount: 100,
			credit_amount: 1,
		});
	});

	test("accepts graduated tiers with a terminal infinity boundary", () => {
		const result = CreditSystemConfigSchema.safeParse({
			...baseCreditConfig,
			invoice_credit: true,
			schema: [
				{
					metered_feature_id: "feature_a",
					feature_amount: 100,
					tier_behavior: "graduated",
					tiers: [
						{ to: 10_000, credit_amount: 1 },
						{ to: 50_000, credit_amount: 0.8 },
						{ to: "inf", credit_amount: 0.5 },
					],
				},
			],
		});

		expect(result.success).toBe(true);
		if (!result.success) return;

		expect(result.data.schema[0]).toEqual({
			metered_feature_id: "feature_a",
			feature_amount: 100,
			tier_behavior: "graduated",
			tiers: [
				{ to: 10_000, credit_amount: 1 },
				{ to: 50_000, credit_amount: 0.8 },
				{ to: "inf", credit_amount: 0.5 },
			],
		});
	});

	test("rejects entries that mix a flat rate with graduated tiers", () => {
		const result = CreditSchemaItemSchema.safeParse({
			metered_feature_id: "feature_a",
			credit_amount: 1,
			tier_behavior: "graduated",
			tiers: [{ to: "inf", credit_amount: 0.5 }],
		});

		expect(result.success).toBe(false);
	});

	test("preserves bounded per-feature usage attribution", () => {
		const result = CustomerEntitlementSchema.parse({
			id: "customer_entitlement_1",
			internal_customer_id: "internal_customer_1",
			internal_entity_id: null,
			internal_feature_id: "credit_feature_internal_id",
			customer_id: "customer_1",
			feature_id: "credits",
			customer_product_id: "customer_product_1",
			entitlement_id: "entitlement_1",
			created_at: 1,
			unlimited: false,
			balance: 10_000,
			additional_balance: 0,
			usage_allowed: false,
			separate_interval: false,
			next_reset_at: null,
			expires_at: null,
			external_id: null,
			usage_attribution: {
				internal_feature_a: { units: 30_000, credits: 260 },
				internal_feature_b: { units: 5_000, credits: 500 },
			},
		});

		expect(result.usage_attribution).toEqual({
			internal_feature_a: { units: 30_000, credits: 260 },
			internal_feature_b: { units: 5_000, credits: 500 },
		});
	});

	test("accepts legacy customer entitlements without attribution", () => {
		const result = CustomerEntitlementSchema.parse({
			id: "customer_entitlement_1",
			internal_customer_id: "internal_customer_1",
			internal_entity_id: null,
			internal_feature_id: "credit_feature_internal_id",
			customer_id: "customer_1",
			feature_id: "credits",
			customer_product_id: "customer_product_1",
			entitlement_id: "entitlement_1",
			created_at: 1,
			unlimited: false,
			balance: 10_000,
			additional_balance: 0,
			usage_allowed: false,
			separate_interval: false,
			next_reset_at: null,
			expires_at: null,
			external_id: null,
		});

		expect(result.usage_attribution).toBeUndefined();
	});
});
