/**
 * catalogV2 — credit dimensions on a rate-card row: create, edit one
 * dimension in place, convert back to a plain row, reject ambiguous cards
 * through both write surfaces, and carry a dimensioned row inside a plan-item
 * feature_override.
 */

import { expect, test } from "bun:test";
import {
	ErrCode,
	entitlements as entitlementsTable,
	FeatureType,
	FeatureUsageType,
	ResetInterval,
} from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { deleteDbPlans } from "../plans/utils/expectCatalogPlans.js";
import {
	deleteDbFeatures,
	expectDbFeaturesCorrect,
} from "../utils/expectCatalogFeatures.js";
import { expectCatalogResultsCorrect } from "../utils/expectCatalogUpdate.js";
import { uniqueTestId } from "../utils/uniqueTestId.js";

const meteredFeature = (featureId: string) => ({
	feature_id: featureId,
	name: featureId,
	type: FeatureType.Metered,
	consumable: true,
});

const dimensionedRate = (meteredFeatureId: string) => ({
	metered_feature_id: meteredFeatureId,
	credit_cost: 1,
	dimensions: {
		small: { match: { size: "small" }, credit_cost: 1 },
		large: { match: { size: "large" }, credit_cost: 16 },
		large_eu: {
			match: { size: "large", region: "eu" },
			credit_cost: 20,
		},
		xl: {
			match: { size: "xl" },
			tier_behavior: "graduated" as const,
			tiers: [
				{ to: 1_000, credit_cost: 30 },
				{ to: "inf" as const, credit_cost: 25 },
			],
		},
	},
	multipliers: {
		spot: { match: { lifecycle: "spot" }, factor: 0.3 },
	},
});

const dimensionedDbRate = (meteredFeatureId: string) => ({
	metered_feature_id: meteredFeatureId,
	credit_amount: 1,
	dimensions: {
		small: { match: { size: "small" }, credit_amount: 1 },
		large: { match: { size: "large" }, credit_amount: 16 },
		large_eu: {
			match: { size: "large", region: "eu" },
			credit_amount: 20,
		},
		xl: {
			match: { size: "xl" },
			tier_behavior: "graduated" as const,
			tiers: [
				{ to: 1_000, credit_amount: 30 },
				{ to: "inf" as const, credit_amount: 25 },
			],
		},
	},
	multipliers: {
		spot: { match: { lifecycle: "spot" }, factor: 0.3 },
	},
});

test.concurrent(
	`${chalk.yellowBright("catalogV2 credit dimensions: creates, edits one dimension, and converts back to a plain row")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const meteredFeatureId = uniqueTestId("dim_metered");
		const creditSystemId = uniqueTestId("dim_credits");
		const featureIds = [meteredFeatureId, creditSystemId];
		const creditSystem = {
			feature_id: creditSystemId,
			name: "Compute credits",
			type: FeatureType.CreditSystem,
			credit_schema: [dimensionedRate(meteredFeatureId)],
		};

		await deleteDbFeatures({ ctx, featureIds });

		try {
			const createResponse = await autumnV2_3.catalogV2.update({
				features: [meteredFeature(meteredFeatureId), creditSystem],
			});
			expectCatalogResultsCorrect({
				response: createResponse,
				features: featureIds.map((id) => ({ id, action: "create" })),
			});
			expect(
				createResponse.features.find(({ id }) => id === creditSystemId),
			).toMatchObject({ credit_schema: [dimensionedRate(meteredFeatureId)] });
			await expectDbFeaturesCorrect({
				ctx,
				expected: [
					{
						id: creditSystemId,
						type: FeatureType.CreditSystem,
						usageType: FeatureUsageType.Single,
						creditSchema: [dimensionedDbRate(meteredFeatureId)],
					},
				],
			});

			const repricedLarge = {
				...dimensionedRate(meteredFeatureId),
				dimensions: {
					...dimensionedRate(meteredFeatureId).dimensions,
					large: { match: { size: "large" }, credit_cost: 18 },
				},
			};
			const updateResponse = await autumnV2_3.catalogV2.update({
				features: [{ ...creditSystem, credit_schema: [repricedLarge] }],
			});
			expectCatalogResultsCorrect({
				response: updateResponse,
				features: [{ id: creditSystemId, action: "update" }],
			});
			expect(updateResponse.features[0]).toMatchObject({
				credit_schema: [repricedLarge],
			});

			const plainRow = { metered_feature_id: meteredFeatureId, credit_cost: 2 };
			const flattenResponse = await autumnV2_3.catalogV2.update({
				features: [{ ...creditSystem, credit_schema: [plainRow] }],
			});
			expect(flattenResponse.features[0]).toMatchObject({
				credit_schema: [plainRow],
			});
			await expectDbFeaturesCorrect({
				ctx,
				expected: [
					{
						id: creditSystemId,
						type: FeatureType.CreditSystem,
						creditSchema: [
							{ metered_feature_id: meteredFeatureId, credit_amount: 2 },
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
	`${chalk.yellowBright("catalogV2 credit dimensions: rejects an ambiguous card through both write surfaces")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const meteredFeatureId = uniqueTestId("dim_amb_metered");
		const creditSystemId = uniqueTestId("dim_amb_credits");
		const featureIds = [meteredFeatureId, creditSystemId];
		const ambiguousSchema = [
			{
				metered_feature_id: meteredFeatureId,
				credit_cost: 1,
				dimensions: {
					large: { match: { size: "large" }, credit_cost: 16 },
					eu: { match: { region: "eu" }, credit_cost: 12 },
				},
			},
		];

		await deleteDbFeatures({ ctx, featureIds });

		try {
			await autumnV2_3.catalogV2.update({
				features: [
					meteredFeature(meteredFeatureId),
					{
						feature_id: creditSystemId,
						name: creditSystemId,
						type: FeatureType.CreditSystem,
						credit_schema: [
							{ metered_feature_id: meteredFeatureId, credit_cost: 1 },
						],
					},
				],
			});

			await expectAutumnError({
				errCode: ErrCode.InvalidFeature,
				errMessage: "can both match the same event",
				func: () =>
					autumnV2_3.catalogV2.update({
						features: [
							{
								feature_id: creditSystemId,
								name: creditSystemId,
								type: FeatureType.CreditSystem,
								credit_schema: ambiguousSchema,
							},
						],
					}),
			});

			await expectAutumnError({
				errCode: ErrCode.InvalidFeature,
				errMessage: "can both match the same event",
				func: () =>
					autumnV2_3.post("/features.update", {
						feature_id: creditSystemId,
						credit_schema: ambiguousSchema,
					}),
			});

			const prioritised = [
				{
					...ambiguousSchema[0],
					dimensions: {
						large: { match: { size: "large" }, credit_cost: 16 },
						eu: { match: { region: "eu" }, priority: 1, credit_cost: 12 },
					},
				},
			];
			const response = await autumnV2_3.post("/features.update", {
				feature_id: creditSystemId,
				credit_schema: prioritised,
			});
			expect(response).toMatchObject({ credit_schema: prioritised });
		} finally {
			await deleteDbFeatures({ ctx, featureIds });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 credit dimensions: a plan-item feature_override carries a dimensioned row")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const meteredFeatureId = uniqueTestId("dim_ovr_metered");
		const creditSystemId = uniqueTestId("dim_ovr_credits");
		const planId = uniqueTestId("dim_ovr_plan");
		const featureIds = [meteredFeatureId, creditSystemId];
		const override = { credit_schema: [dimensionedRate(meteredFeatureId)] };

		await deleteDbPlans({ ctx, planIds: [planId] });
		await deleteDbFeatures({ ctx, featureIds });

		try {
			await autumnV2_3.catalogV2.update({
				features: [
					meteredFeature(meteredFeatureId),
					{
						feature_id: creditSystemId,
						name: creditSystemId,
						type: FeatureType.CreditSystem,
						credit_schema: [
							{ metered_feature_id: meteredFeatureId, credit_cost: 1 },
						],
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
								feature_override: override,
							},
						],
					},
				],
			});

			const rows = await ctx.db
				.select({
					feature_id: entitlementsTable.feature_id,
					feature_override: entitlementsTable.feature_override,
				})
				.from(entitlementsTable)
				.where(eq(entitlementsTable.org_id, ctx.org.id));
			const overrideRow = rows.find((row) => row.feature_id === creditSystemId);
			expect(overrideRow?.feature_override?.schema).toEqual([
				dimensionedDbRate(meteredFeatureId),
			]);
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
			await deleteDbFeatures({ ctx, featureIds });
		}
	},
);
