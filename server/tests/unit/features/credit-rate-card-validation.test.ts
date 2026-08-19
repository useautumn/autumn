import { describe, expect, test } from "bun:test";
import {
	ApiVersion,
	ApiVersionClass,
	AppEnv,
	type CreditSystemConfig,
	dbToApiFeatureV1,
	type Feature,
	FeatureType,
	FeatureUsageType,
	featureV1ToDbFeature,
	featureV1ToDbFeatureConfig,
	type SharedContext,
	toApiFeature,
} from "@autumn/shared";
import { validateCreditSystem } from "@/internal/features/featureUtils.js";

const validate = (
	config: Omit<CreditSystemConfig, "usage_type">,
	featureType: FeatureType = FeatureType.CreditSystem,
) =>
	validateCreditSystem(
		{ ...config, usage_type: FeatureUsageType.Single },
		featureType,
	);

const ctx = {} as SharedContext;

const buildStoredCreditFeature = ({
	schema,
	invoiceCredit,
}: {
	schema: Feature["config"]["schema"];
	invoiceCredit?: boolean;
}): Feature => ({
	internal_id: "fe_credits",
	org_id: "org_test",
	created_at: 1,
	env: AppEnv.Sandbox,
	id: "credits",
	name: "Credits",
	type: FeatureType.CreditSystem,
	config: {
		schema,
		invoice_credit: invoiceCredit,
		usage_type: FeatureUsageType.Single,
	},
	display: null,
	archived: false,
	event_names: [],
	model_markups: null,
	stripe_meter: null,
});

describe("credit rate-card validation", () => {
	test("accepts legacy flat, per-X, and graduated rates", () => {
		expect(
			validate({
				schema: [
					{ metered_feature_id: "legacy", credit_amount: 0.2 },
					{
						metered_feature_id: "per_x",
						feature_amount: 100,
						credit_amount: 1,
					},
					{
						metered_feature_id: "tiered",
						feature_amount: 100,
						tier_behavior: "graduated",
						tiers: [
							{ to: 10_000, credit_amount: 1 },
							{ to: "inf", credit_amount: 0 },
						],
					},
				],
				invoice_credit: true,
			}),
		).toMatchObject({ invoice_credit: true });
	});

	test.each([
		{
			name: "zero billing units",
			schema: [
				{
					metered_feature_id: "feature_a",
					feature_amount: 0,
					credit_amount: 1,
				},
			],
		},
		{
			name: "negative flat cost",
			schema: [{ metered_feature_id: "feature_a", credit_amount: -1 }],
		},
		{
			name: "empty tiers",
			schema: [
				{
					metered_feature_id: "feature_a",
					tier_behavior: "graduated",
					tiers: [],
				},
			],
		},
		{
			name: "unordered tiers",
			schema: [
				{
					metered_feature_id: "feature_a",
					tier_behavior: "graduated",
					tiers: [
						{ to: 100, credit_amount: 1 },
						{ to: 50, credit_amount: 0.8 },
						{ to: "inf", credit_amount: 0.5 },
					],
				},
			],
		},
		{
			name: "missing infinity tier",
			schema: [
				{
					metered_feature_id: "feature_a",
					tier_behavior: "graduated",
					tiers: [{ to: 100, credit_amount: 1 }],
				},
			],
		},
		{
			name: "negative tier cost",
			schema: [
				{
					metered_feature_id: "feature_a",
					tier_behavior: "graduated",
					tiers: [{ to: "inf", credit_amount: -0.5 }],
				},
			],
		},
	] as const)("rejects $name", ({ schema }) => {
		expect(() =>
			validate({ schema } as unknown as Omit<CreditSystemConfig, "usage_type">),
		).toThrow();
	});

	test("rejects classic rate-card fields on AI credit systems", () => {
		expect(() =>
			validate(
				{ schema: [], invoice_credit: true },
				FeatureType.AiCreditSystem,
			),
		).toThrow(/invoice/i);

		expect(() =>
			validate(
				{
					schema: [{ metered_feature_id: "feature_a", credit_amount: 1 }],
				},
				FeatureType.AiCreditSystem,
			),
		).toThrow(/cannot define a schema/i);
	});
});

describe("credit rate-card API mapping", () => {
	test("maps public per-X and graduated rates to storage and back", () => {
		const stored = featureV1ToDbFeature({
			apiFeature: {
				id: "credits",
				name: "Credits",
				type: FeatureType.CreditSystem,
				invoice_credit: true,
				credit_schema: [
					{
						metered_feature_id: "feature_a",
						billing_units: 100,
						credit_cost: 1,
					},
					{
						metered_feature_id: "feature_b",
						billing_units: 1_000,
						tier_behavior: "graduated",
						tiers: [
							{ to: 10_000, credit_cost: 1 },
							{ to: "inf", credit_cost: 0.5 },
						],
					},
				],
			},
		});

		expect(stored.config).toMatchObject({
			invoice_credit: true,
			schema: [
				{
					metered_feature_id: "feature_a",
					feature_amount: 100,
					credit_amount: 1,
				},
				{
					metered_feature_id: "feature_b",
					feature_amount: 1_000,
					tier_behavior: "graduated",
					tiers: [
						{ to: 10_000, credit_amount: 1 },
						{ to: "inf", credit_amount: 0.5 },
					],
				},
			],
		});

		const response = dbToApiFeatureV1({
			ctx,
			dbFeature: { ...stored, internal_id: "fe_credits" },
		});
		expect(response).toMatchObject({
			invoice_credit: true,
			credit_schema: [
				{
					metered_feature_id: "feature_a",
					billing_units: 100,
					credit_cost: 1,
				},
				{
					metered_feature_id: "feature_b",
					billing_units: 1_000,
					tier_behavior: "graduated",
					tiers: [
						{ to: 10_000, credit_cost: 1 },
						{ to: "inf", credit_cost: 0.5 },
					],
				},
			],
		});
	});

	test("preserves fields unknown to an older update client", () => {
		const originalFeature = buildStoredCreditFeature({
			invoiceCredit: true,
			schema: [
				{
					metered_feature_id: "feature_a",
					feature_amount: 100,
					tier_behavior: "graduated",
					tiers: [{ to: "inf", credit_amount: 0.5 }],
				},
			],
		});

		expect(
			featureV1ToDbFeatureConfig({
				apiFeature: { name: "Renamed credits" },
				originalFeature,
			}),
		).toBeUndefined();

		expect(
			featureV1ToDbFeatureConfig({
				apiFeature: {
					credit_schema: [{ metered_feature_id: "feature_a", credit_cost: 2 }],
				},
				originalFeature,
			}),
		).toMatchObject({
			invoice_credit: true,
			schema: [{ metered_feature_id: "feature_a", credit_amount: 2 }],
		});
	});

	test("preserves flat V2.3 responses and hides unsupported cards", () => {
		const flatResponse = dbToApiFeatureV1({
			ctx,
			dbFeature: buildStoredCreditFeature({
				schema: [
					{
						metered_feature_id: "feature_a",
						feature_amount: 1,
						credit_amount: 0.2,
					},
				],
			}),
			targetVersion: new ApiVersionClass(ApiVersion.V2_3),
		});
		expect(flatResponse.credit_schema).toEqual([
			{ metered_feature_id: "feature_a", credit_cost: 0.2 },
		]);
		expect(flatResponse).not.toHaveProperty("invoice_credit");

		const graduatedResponse = dbToApiFeatureV1({
			ctx,
			dbFeature: buildStoredCreditFeature({
				invoiceCredit: true,
				schema: [
					{
						metered_feature_id: "feature_a",
						feature_amount: 100,
						tier_behavior: "graduated",
						tiers: [{ to: "inf", credit_amount: 0.5 }],
					},
				],
			}),
			targetVersion: new ApiVersionClass(ApiVersion.V2_3),
		});
		expect(graduatedResponse).not.toHaveProperty("credit_schema");
		expect(graduatedResponse).not.toHaveProperty("invoice_credit");
	});

	test("does not expose an incompatible rate card through legacy nested feature responses", () => {
		const response = toApiFeature({
			feature: buildStoredCreditFeature({
				invoiceCredit: true,
				schema: [
					{
						metered_feature_id: "feature_a",
						feature_amount: 100,
						tier_behavior: "graduated",
						tiers: [{ to: "inf", credit_amount: 0.5 }],
					},
				],
			}),
		});

		expect(response).not.toHaveProperty("credit_schema");
	});
});
