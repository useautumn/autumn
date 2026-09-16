import { expect, test } from "bun:test";
import {
	BillingInterval,
	BillingMethod,
	FeatureType,
	FeatureUsageType,
	ResetInterval,
} from "@autumn/shared";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { deleteDbPlans } from "../plans/utils/expectCatalogPlans.js";
import {
	deleteDbFeatures,
	expectDbFeaturesCorrect,
} from "../utils/expectCatalogFeatures.js";
import { expectCatalogResultsCorrect } from "../utils/expectCatalogUpdate.js";
import { uniqueTestId } from "../utils/uniqueTestId.js";

test.concurrent(
	`${chalk.yellowBright("catalogV2 credit rate card: creates and updates flat and graduated rates")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const flatFeatureId = uniqueTestId("rate_flat");
		const tieredFeatureId = uniqueTestId("rate_tiered");
		const creditSystemId = uniqueTestId("rate_credits");
		const featureIds = [flatFeatureId, tieredFeatureId, creditSystemId];

		const meteredFeature = (featureId: string) => ({
			feature_id: featureId,
			name: featureId,
			type: FeatureType.Metered,
			consumable: true,
		});
		const flatCreditRate = {
			metered_feature_id: flatFeatureId,
			billing_units: 100,
			credit_cost: 1,
		};
		const graduatedCreditRate = {
			metered_feature_id: tieredFeatureId,
			billing_units: 1_000,
			tier_behavior: "graduated" as const,
			tiers: [
				{ to: 10_000, credit_cost: 1 },
				{ to: "inf" as const, credit_cost: 0.5 },
			],
		};
		const initialCreditSchema = [flatCreditRate, graduatedCreditRate];
		const creditSystem = {
			feature_id: creditSystemId,
			name: "Enterprise credits",
			type: FeatureType.CreditSystem,
			credit_schema: initialCreditSchema,
		};

		await deleteDbFeatures({ ctx, featureIds });

		try {
			const createResponse = await autumnV2_3.catalogV2.update({
				features: [
					meteredFeature(flatFeatureId),
					meteredFeature(tieredFeatureId),
					creditSystem,
				],
			});
			expectCatalogResultsCorrect({
				response: createResponse,
				features: featureIds.map((id) => ({ id, action: "create" })),
			});
			expect(
				createResponse.features.find(({ id }) => id === creditSystemId),
			).toMatchObject({
				credit_schema: initialCreditSchema,
			});
			await expectDbFeaturesCorrect({
				ctx,
				expected: [
					{
						id: creditSystemId,
						type: FeatureType.CreditSystem,
						usageType: FeatureUsageType.Single,
						creditSchema: [
							{
								metered_feature_id: flatFeatureId,
								feature_amount: 100,
								credit_amount: 1,
							},
							{
								metered_feature_id: tieredFeatureId,
								feature_amount: 1_000,
								tier_behavior: "graduated",
								tiers: [
									{ to: 10_000, credit_amount: 1 },
									{ to: "inf", credit_amount: 0.5 },
								],
							},
						],
					},
				],
			});

			const updatedCreditSchema = [
				flatCreditRate,
				{
					...graduatedCreditRate,
					tiers: [
						{ to: 20_000, credit_cost: 1 },
						{ to: "inf" as const, credit_cost: 0.4 },
					],
				},
			];
			const updateResponse = await autumnV2_3.catalogV2.update({
				features: [
					{
						...creditSystem,
						credit_schema: updatedCreditSchema,
					},
				],
			});
			expectCatalogResultsCorrect({
				response: updateResponse,
				features: [{ id: creditSystemId, action: "update" }],
			});
			expect(updateResponse.features[0]).toMatchObject({
				credit_schema: updatedCreditSchema,
			});
			await expectDbFeaturesCorrect({
				ctx,
				expected: [
					{
						id: creditSystemId,
						type: FeatureType.CreditSystem,
						creditSchema: [
							{
								metered_feature_id: flatFeatureId,
								feature_amount: 100,
								credit_amount: 1,
							},
							{
								metered_feature_id: tieredFeatureId,
								feature_amount: 1_000,
								tier_behavior: "graduated",
								tiers: [
									{ to: 20_000, credit_amount: 1 },
									{ to: "inf", credit_amount: 0.4 },
								],
							},
						],
					},
				],
			});
		} finally {
			await deleteDbFeatures({ ctx, featureIds });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 credit rate card: a rate card update saves on a feature with a pooled plan item")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const meteredFeatureId = uniqueTestId("rate_pooled_metered");
		const creditSystemId = uniqueTestId("rate_pooled_credits");
		const planId = uniqueTestId("rate_pooled_plan");
		const featureIds = [meteredFeatureId, creditSystemId];
		const creditSchema = [
			{
				metered_feature_id: meteredFeatureId,
				credit_cost: 1,
			},
		];

		await deleteDbPlans({ ctx, planIds: [planId] });
		await deleteDbFeatures({ ctx, featureIds });

		try {
			await autumnV2_3.catalogV2.update({
				features: [
					{
						feature_id: meteredFeatureId,
						name: meteredFeatureId,
						type: FeatureType.Metered,
						consumable: true,
					},
					{
						feature_id: creditSystemId,
						name: creditSystemId,
						type: FeatureType.CreditSystem,
						credit_schema: creditSchema,
					},
				],
				plans: [
					{
						plan_id: planId,
						name: planId,
						items: [
							{
								feature_id: creditSystemId,
								included: 100,
								pooled: true,
							},
						],
					},
				],
			});

			const catalogResponse = await autumnV2_3.catalogV2.update({
				features: [
					{
						feature_id: creditSystemId,
						name: creditSystemId,
						type: FeatureType.CreditSystem,
						credit_schema: creditSchema,
					},
				],
			});
			expect(catalogResponse.features[0]).toMatchObject({ id: creditSystemId });

			await autumnV2_3.post("/features.update", {
				feature_id: creditSystemId,
				credit_schema: creditSchema,
			});
			await expectDbFeaturesCorrect({
				ctx,
				expected: [
					{
						id: creditSystemId,
						type: FeatureType.CreditSystem,
					},
				],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
			await deleteDbFeatures({ ctx, featureIds });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 credit rate card: a rate card update saves on a feature with an included-only plan item")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const meteredFeatureId = uniqueTestId("rate_included_metered");
		const creditSystemId = uniqueTestId("rate_included_credits");
		const planId = uniqueTestId("rate_included_plan");
		const featureIds = [meteredFeatureId, creditSystemId];
		const creditSchema = [
			{
				metered_feature_id: meteredFeatureId,
				credit_cost: 1,
			},
		];

		await deleteDbPlans({ ctx, planIds: [planId] });
		await deleteDbFeatures({ ctx, featureIds });

		try {
			await autumnV2_3.catalogV2.update({
				features: [
					{
						feature_id: meteredFeatureId,
						name: meteredFeatureId,
						type: FeatureType.Metered,
						consumable: true,
					},
					{
						feature_id: creditSystemId,
						name: creditSystemId,
						type: FeatureType.CreditSystem,
						credit_schema: creditSchema,
					},
				],
				plans: [
					{
						plan_id: planId,
						name: planId,
						items: [{ feature_id: creditSystemId, included: 100 }],
					},
				],
			});

			const catalogResponse = await autumnV2_3.catalogV2.update({
				features: [
					{
						feature_id: creditSystemId,
						name: creditSystemId,
						type: FeatureType.CreditSystem,
						credit_schema: creditSchema,
					},
				],
			});
			expect(catalogResponse.features[0]).toMatchObject({ id: creditSystemId });

			await autumnV2_3.post("/features.update", {
				feature_id: creditSystemId,
				credit_schema: creditSchema,
			});
			await expectDbFeaturesCorrect({
				ctx,
				expected: [
					{
						id: creditSystemId,
						type: FeatureType.CreditSystem,
					},
				],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
			await deleteDbFeatures({ ctx, featureIds });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 credit rate card: unpooling and pricing a credit item saves atomically with a rate card update")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const meteredFeatureId = uniqueTestId("rate_atomic_pool_metered");
		const creditSystemId = uniqueTestId("rate_atomic_pool_credits");
		const planId = uniqueTestId("rate_atomic_pool_plan");
		const featureIds = [meteredFeatureId, creditSystemId];
		const creditSchema = [
			{ metered_feature_id: meteredFeatureId, credit_cost: 1 },
		];
		const usagePrice = {
			amount: 1,
			interval: BillingInterval.Month,
			billing_method: BillingMethod.UsageBased,
			billing_units: 1,
		};

		await deleteDbPlans({ ctx, planIds: [planId] });
		await deleteDbFeatures({ ctx, featureIds });

		try {
			await autumnV2_3.catalogV2.update({
				features: [
					{
						feature_id: meteredFeatureId,
						name: meteredFeatureId,
						type: FeatureType.Metered,
						consumable: true,
					},
					{
						feature_id: creditSystemId,
						name: creditSystemId,
						type: FeatureType.CreditSystem,
						credit_schema: creditSchema,
					},
				],
				plans: [
					{
						plan_id: planId,
						name: planId,
						items: [
							{
								feature_id: creditSystemId,
								included: 100,
								pooled: true,
								reset: { interval: ResetInterval.Month },
							},
						],
					},
				],
			});

			const response = await autumnV2_3.catalogV2.update({
				features: [
					{
						feature_id: creditSystemId,
						name: creditSystemId,
						type: FeatureType.CreditSystem,
						credit_schema: creditSchema,
					},
				],
				plans: [
					{
						plan_id: planId,
						name: planId,
						items: [
							{
								feature_id: creditSystemId,
								included: 100,
								pooled: false,
								reset: { interval: ResetInterval.Month },
								price: usagePrice,
							},
						],
					},
				],
			});

			expect(response.features[0]).toMatchObject({ id: creditSystemId });
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
			await deleteDbFeatures({ ctx, featureIds });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 credit rate card: converting included usage to priced usage saves atomically with a rate card update")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const meteredFeatureId = uniqueTestId("rate_atomic_price_metered");
		const creditSystemId = uniqueTestId("rate_atomic_price_credits");
		const planId = uniqueTestId("rate_atomic_price_plan");
		const featureIds = [meteredFeatureId, creditSystemId];
		const creditSchema = [
			{ metered_feature_id: meteredFeatureId, credit_cost: 1 },
		];

		await deleteDbPlans({ ctx, planIds: [planId] });
		await deleteDbFeatures({ ctx, featureIds });

		try {
			await autumnV2_3.catalogV2.update({
				features: [
					{
						feature_id: meteredFeatureId,
						name: meteredFeatureId,
						type: FeatureType.Metered,
						consumable: true,
					},
					{
						feature_id: creditSystemId,
						name: creditSystemId,
						type: FeatureType.CreditSystem,
						credit_schema: creditSchema,
					},
				],
				plans: [
					{
						plan_id: planId,
						name: planId,
						items: [
							{
								feature_id: creditSystemId,
								included: 100,
								reset: { interval: ResetInterval.Month },
							},
						],
					},
				],
			});

			const response = await autumnV2_3.catalogV2.update({
				features: [
					{
						feature_id: creditSystemId,
						name: creditSystemId,
						type: FeatureType.CreditSystem,
						credit_schema: creditSchema,
					},
				],
				plans: [
					{
						plan_id: planId,
						name: planId,
						items: [
							{
								feature_id: creditSystemId,
								included: 100,
								reset: { interval: ResetInterval.Month },
								price: {
									amount: 1,
									interval: BillingInterval.Month,
									billing_method: BillingMethod.UsageBased,
									billing_units: 1,
								},
							},
						],
					},
				],
			});

			expect(response.features[0]).toMatchObject({ id: creditSystemId });
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
			await deleteDbFeatures({ ctx, featureIds });
		}
	},
);
