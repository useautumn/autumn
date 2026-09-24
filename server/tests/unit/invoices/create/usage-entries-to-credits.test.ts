import { describe, expect, test } from "bun:test";
import { ErrCode, FeatureType } from "@autumn/shared";
import { features } from "@tests/utils/fixtures/db/features";
import { usageEntriesToCredits } from "@/internal/invoices/actions/create/compute/usageEntriesToCredits";

const creditSystem = features.create({
	id: "credits",
	name: "Credits",
	type: FeatureType.CreditSystem,
	config: {
		usage_type: "single_use",
		schema: [
			{
				metered_feature_id: "tokens",
				feature_amount: 1,
				credit_amount: 2,
				dimensions: {
					premium: { match: { model: "premium" }, credit_amount: 5 },
					premium_eu: {
						match: { model: "premium", region: "eu" },
						credit_amount: 8,
					},
				},
				multipliers: {
					rush: { match: { rush: "true" }, factor: 2 },
					surcharge: { match: { rush: "true" }, add: 1 },
				},
			},
			{
				metered_feature_id: "requests",
				feature_amount: 1,
				tier_behavior: "graduated",
				tiers: [
					{ to: 100, credit_amount: 1 },
					{ to: "inf", credit_amount: 0.5 },
				],
			},
		],
	},
});

describe("usageEntriesToCredits", () => {
	test("flat rate converts source units to credits", () => {
		expect(
			usageEntriesToCredits({
				creditSystem,
				entries: [{ feature_id: "tokens", quantity: 1000 }],
			}),
		).toBe(2000);
	});

	test("a matching dimension replaces the base rate", () => {
		expect(
			usageEntriesToCredits({
				creditSystem,
				entries: [
					{
						feature_id: "tokens",
						quantity: 100,
						properties: { model: "premium" },
					},
				],
			}),
		).toBe(500);
	});

	test("the most specific dimension wins", () => {
		expect(
			usageEntriesToCredits({
				creditSystem,
				entries: [
					{
						feature_id: "tokens",
						quantity: 100,
						properties: { model: "premium", region: "eu" },
					},
				],
			}),
		).toBe(800);
	});

	test("multipliers stack: factors first, then adds", () => {
		// base 2 × factor 2 + add 1 = 5 per unit
		expect(
			usageEntriesToCredits({
				creditSystem,
				entries: [
					{ feature_id: "tokens", quantity: 10, properties: { rush: true } },
				],
			}),
		).toBe(50);
	});

	test("graduated credit tiers start from zero", () => {
		// 150 requests: 100 × 1 + 50 × 0.5 = 125
		expect(
			usageEntriesToCredits({
				creditSystem,
				entries: [{ feature_id: "requests", quantity: 150 }],
			}),
		).toBe(125);
	});

	test("entries for the same feature and properties are summed before tiering", () => {
		// Two entries of 75 must price as one batch of 150, not two batches of 75 (= 150).
		expect(
			usageEntriesToCredits({
				creditSystem,
				entries: [
					{ feature_id: "requests", quantity: 75 },
					{ feature_id: "requests", quantity: 75 },
				],
			}),
		).toBe(125);
	});

	test("entries with different properties are priced separately", () => {
		expect(
			usageEntriesToCredits({
				creditSystem,
				entries: [
					{ feature_id: "tokens", quantity: 100 },
					{
						feature_id: "tokens",
						quantity: 100,
						properties: { model: "premium" },
					},
				],
			}),
		).toBe(200 + 500);
	});

	test("a source feature missing from the rate card is rejected", () => {
		expect(() =>
			usageEntriesToCredits({
				creditSystem,
				entries: [{ feature_id: "storage", quantity: 1 }],
			}),
		).toThrow(expect.objectContaining({ code: ErrCode.InvalidRequest }));
	});

	test("a non credit-system feature is rejected", () => {
		expect(() =>
			usageEntriesToCredits({
				creditSystem: features.create({ id: "tokens", name: "Tokens" }),
				entries: [{ feature_id: "tokens", quantity: 1 }],
			}),
		).toThrow(expect.objectContaining({ code: ErrCode.InvalidRequest }));
	});
});
