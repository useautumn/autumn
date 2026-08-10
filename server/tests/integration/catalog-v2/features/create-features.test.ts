/**
 * catalogV2.update / catalogV2.preview_update — creating features.
 *
 * Contract: net-new ids in params.features are inserted, one per type
 * (boolean, continuous metered, consumable metered, credit system, AI credit
 * system). Preview takes the exact same update params, reports action
 * "create" per feature, and writes nothing.
 */

import { expect, test } from "bun:test";
import { FeatureType, FeatureUsageType } from "@autumn/shared";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import {
	deleteDbFeatures,
	expectDbFeaturesAbsent,
	expectDbFeaturesCorrect,
} from "../utils/expectCatalogFeatures.js";
import { uniqueTestId } from "../utils/uniqueTestId.js";

test.concurrent(
	`${chalk.yellowBright("catalogV2 create features: preview reports creates, update inserts one of each type")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });

		const booleanFeature = {
			feature_id: uniqueTestId("catalogv2_dashboard"),
			name: "CatalogV2 Dashboard",
			type: FeatureType.Boolean,
		};
		const continuousFeature = {
			feature_id: uniqueTestId("catalogv2_seats"),
			name: "CatalogV2 Seats",
			type: FeatureType.Metered,
			consumable: false,
		};
		const consumableFeature = {
			feature_id: uniqueTestId("catalogv2_messages"),
			name: "CatalogV2 Messages",
			type: FeatureType.Metered,
			consumable: true,
		};
		const creditSystemFeature = {
			feature_id: uniqueTestId("catalogv2_credits"),
			name: "CatalogV2 Credits",
			type: FeatureType.CreditSystem,
			credit_schema: [
				{ metered_feature_id: consumableFeature.feature_id, credit_cost: 2 },
			],
		};
		const aiCreditSystemFeature = {
			feature_id: uniqueTestId("catalogv2_ai_credits"),
			name: "CatalogV2 AI Credits",
			type: FeatureType.AiCreditSystem,
			default_markup: 50,
		};

		const params = {
			features: [
				booleanFeature,
				continuousFeature,
				consumableFeature,
				creditSystemFeature,
				aiCreditSystemFeature,
			],
		};
		const featureIds = params.features.map((feature) => feature.feature_id);

		// Leftover rows from a previously failed run
		await deleteDbFeatures({ ctx, featureIds });

		try {
			const previewResponse = await autumnV2_3.catalogV2.previewUpdate(params);
			expect(
				previewResponse.features.map(({ feature_id, action }) => ({
					feature_id,
					action,
				})),
			).toEqual(featureIds.map((id) => ({ feature_id: id, action: "create" })));
			await expectDbFeaturesAbsent({ ctx, featureIds });

			const updateResponse = await autumnV2_3.catalogV2.update(params);
			expect(updateResponse.results.features).toEqual(
				featureIds.map((id) => ({ id, action: "create" })),
			);
			await expectDbFeaturesCorrect({
				ctx,
				expected: [
					{ id: booleanFeature.feature_id, type: FeatureType.Boolean },
					{
						id: continuousFeature.feature_id,
						type: FeatureType.Metered,
						usageType: FeatureUsageType.Continuous,
					},
					{
						id: consumableFeature.feature_id,
						type: FeatureType.Metered,
						usageType: FeatureUsageType.Single,
					},
					{
						id: creditSystemFeature.feature_id,
						type: FeatureType.CreditSystem,
						usageType: FeatureUsageType.Single,
						creditSchema: [
							{
								metered_feature_id: consumableFeature.feature_id,
								credit_amount: 2,
							},
						],
					},
					{
						id: aiCreditSystemFeature.feature_id,
						type: FeatureType.AiCreditSystem,
						usageType: FeatureUsageType.Single,
						defaultMarkup: 50,
					},
				],
			});
		} finally {
			await deleteDbFeatures({ ctx, featureIds });
		}
	},
);
