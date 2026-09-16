/**
 * Plan items for credit systems accept any price shape. Whether a customer's
 * credits are itemized is decided per entitlement from that shape, so nothing
 * about a feature's invoice_credit flag can make an item invalid.
 */

import { describe, expect, test } from "bun:test";
import {
	AppEnv,
	FeatureType,
	type ProductItem,
	ProductItemInterval,
	UsageModel,
} from "@autumn/shared";
import { features } from "@tests/utils/fixtures/db/features.js";
import { validateProductItems } from "@/internal/products/product-items/validateProductItems.js";

const flaggedCredits = features.create({
	id: "invoice_credits",
	name: "Invoice credits",
	type: FeatureType.CreditSystem,
	config: { invoice_credit: true, schema: [] },
});

const validate = (item: ProductItem) =>
	validateProductItems({
		newItems: [item],
		features: [flaggedCredits],
		orgId: "org_test",
		env: AppEnv.Sandbox,
		multiCurrencyEnabled: true,
	});

describe("credit system plan items", () => {
	test("an included-only item saves even when the feature is flagged", () => {
		expect(() =>
			validate({
				feature_id: flaggedCredits.id,
				included_usage: 100,
				interval: ProductItemInterval.Month,
			}),
		).not.toThrow();
	});

	test("a fractional pay-per-use price saves; it simply does not itemize", () => {
		expect(() =>
			validate({
				feature_id: flaggedCredits.id,
				included_usage: 100,
				interval: ProductItemInterval.Month,
				usage_model: UsageModel.PayPerUse,
				price: 0.002,
				billing_units: 1,
			}),
		).not.toThrow();
	});

	test("a pooled included-only item saves even when the feature is flagged", () => {
		expect(() =>
			validate({
				feature_id: flaggedCredits.id,
				included_usage: 100,
				interval: ProductItemInterval.Month,
				pooled: true,
			}),
		).not.toThrow();
	});
});
