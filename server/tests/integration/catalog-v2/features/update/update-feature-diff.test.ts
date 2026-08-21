/**
 * catalogV2.preview_update — previous_attributes captures each field exactly.
 *
 * Contract: the diff is field-by-field with default-aware equality. An
 * identical entry (any collection order) reports action "none". Omitting
 * display keeps the current one (no diff); omitting event_names wipes them
 * (real diff). Omitting archived preserves the current archived state.
 * Every changed field appears in previous_attributes with its exact previous
 * value, and nothing else does.
 */

import { expect, test } from "bun:test";
import { FeatureType } from "@autumn/shared";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { deleteDbFeatures } from "../../utils/expectCatalogFeatures.js";
import { expectDbFeatureArchived } from "../../utils/expectCatalogSideEffects.js";
import {
	expectCatalogPreviewCorrect,
	expectCatalogResultsCorrect,
} from "../../utils/expectCatalogUpdate.js";
import { uniqueTestId } from "../../utils/uniqueTestId.js";

test.concurrent(
	`${chalk.yellowBright("catalogV2 feature diff: metered fields — name, consumable, display, event_names")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const featureId = uniqueTestId("cv2_diff_metered");
		const metered = {
			feature_id: featureId,
			name: "CV2 Diff Metered",
			type: FeatureType.Metered,
			consumable: true,
			event_names: ["cv2_diff_sent", "cv2_diff_used"],
			display: { singular: "message", plural: "messages" },
		};
		await deleteDbFeatures({ ctx, featureIds: [featureId] });

		const previewOne = async (entry: Record<string, unknown>) =>
			autumnV2_3.catalogV2.previewUpdate({
				features: [{ ...metered, ...entry }],
			});

		try {
			await autumnV2_3.catalogV2.update({ features: [metered] });

			// Identical entry, collections reordered → nothing changed
			expectCatalogPreviewCorrect({
				preview: await previewOne({
					event_names: [...metered.event_names].reverse(),
				}),
				features: [{ featureId, action: "none", previousAttributes: null }],
			});

			// Omitting display keeps the current one
			expectCatalogPreviewCorrect({
				preview: await previewOne({ display: undefined }),
				features: [{ featureId, action: "none", previousAttributes: null }],
			});

			// One changed field → exactly that field, holding its previous value
			expectCatalogPreviewCorrect({
				preview: await previewOne({ name: "CV2 Diff Renamed" }),
				features: [
					{
						featureId,
						action: "update",
						previousAttributes: { name: metered.name },
					},
				],
			});
			expectCatalogPreviewCorrect({
				preview: await previewOne({ consumable: false }),
				features: [
					{
						featureId,
						action: "update",
						previousAttributes: { consumable: true },
					},
				],
			});
			expectCatalogPreviewCorrect({
				preview: await previewOne({
					display: { singular: "msg", plural: "msgs" },
				}),
				features: [
					{
						featureId,
						action: "update",
						previousAttributes: { display: metered.display },
					},
				],
			});

			// Omitting event_names wipes them — a real diff
			expectCatalogPreviewCorrect({
				preview: await previewOne({ event_names: undefined }),
				features: [
					{
						featureId,
						action: "update",
						previousAttributes: { event_names: metered.event_names },
					},
				],
			});
		} finally {
			await deleteDbFeatures({ ctx, featureIds: [featureId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 feature diff: credit schema — order-insensitive, cost and entry changes captured")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const meteredAId = uniqueTestId("cv2_diff_cs_metered_a");
		const meteredBId = uniqueTestId("cv2_diff_cs_metered_b");
		const creditSystemId = uniqueTestId("cv2_diff_cs");
		const featureIds = [creditSystemId, meteredAId, meteredBId];

		const meteredEntry = (featureId: string) => ({
			feature_id: featureId,
			name: featureId,
			type: FeatureType.Metered,
			consumable: true,
		});
		const creditSchema = [
			{ metered_feature_id: meteredAId, credit_cost: 2 },
			{ metered_feature_id: meteredBId, credit_cost: 1 },
		];
		const creditSystem = {
			feature_id: creditSystemId,
			name: "CV2 Diff Credits",
			type: FeatureType.CreditSystem,
			credit_schema: creditSchema,
		};
		await deleteDbFeatures({ ctx, featureIds });

		const previewSchema = async (schema: typeof creditSchema) =>
			autumnV2_3.catalogV2.previewUpdate({
				features: [{ ...creditSystem, credit_schema: schema }],
			});

		try {
			await autumnV2_3.catalogV2.update({
				features: [
					meteredEntry(meteredAId),
					meteredEntry(meteredBId),
					creditSystem,
				],
			});

			// Same schema, reversed order → nothing changed
			expectCatalogPreviewCorrect({
				preview: await previewSchema([...creditSchema].reverse()),
				features: [
					{
						featureId: creditSystemId,
						action: "none",
						previousAttributes: null,
					},
				],
			});

			// Cost change → previous schema captured whole
			expectCatalogPreviewCorrect({
				preview: await previewSchema([
					{ metered_feature_id: meteredAId, credit_cost: 3 },
					{ metered_feature_id: meteredBId, credit_cost: 1 },
				]),
				features: [
					{
						featureId: creditSystemId,
						action: "update",
						previousAttributes: { credit_schema: creditSchema },
					},
				],
			});

			// Dropped entry → previous schema captured whole
			expectCatalogPreviewCorrect({
				preview: await previewSchema([
					{ metered_feature_id: meteredAId, credit_cost: 2 },
				]),
				features: [
					{
						featureId: creditSystemId,
						action: "update",
						previousAttributes: { credit_schema: creditSchema },
					},
				],
			});
		} finally {
			await deleteDbFeatures({ ctx, featureIds });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 feature diff: AI credit system markups — default, provider and model markups captured")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const featureId = uniqueTestId("cv2_diff_ai");
		const aiCreditSystem = {
			feature_id: featureId,
			name: "CV2 Diff AI Credits",
			type: FeatureType.AiCreditSystem,
			default_markup: 50,
			provider_markups: { openai: { markup: 20 } },
			model_markups: { "anthropic/claude-3": { markup: 10 } },
		};
		await deleteDbFeatures({ ctx, featureIds: [featureId] });

		const previewOne = async (entry: Record<string, unknown>) =>
			autumnV2_3.catalogV2.previewUpdate({
				features: [{ ...aiCreditSystem, ...entry }],
			});

		try {
			await autumnV2_3.catalogV2.update({ features: [aiCreditSystem] });

			// Identical entry → nothing changed
			expectCatalogPreviewCorrect({
				preview: await previewOne({}),
				features: [{ featureId, action: "none", previousAttributes: null }],
			});

			expectCatalogPreviewCorrect({
				preview: await previewOne({ default_markup: 60 }),
				features: [
					{
						featureId,
						action: "update",
						previousAttributes: { default_markup: 50 },
					},
				],
			});
			expectCatalogPreviewCorrect({
				preview: await previewOne({
					provider_markups: { openai: { markup: 25 } },
				}),
				features: [
					{
						featureId,
						action: "update",
						previousAttributes: {
							provider_markups: aiCreditSystem.provider_markups,
						},
					},
				],
			});
			expectCatalogPreviewCorrect({
				preview: await previewOne({
					model_markups: { "anthropic/claude-3": { markup: 15 } },
				}),
				features: [
					{
						featureId,
						action: "update",
						previousAttributes: { model_markups: aiCreditSystem.model_markups },
					},
				],
			});
		} finally {
			await deleteDbFeatures({ ctx, featureIds: [featureId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 feature diff: archived — omit preserves, explicit false unarchives")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const featureId = uniqueTestId("cv2_diff_archived");
		const metered = {
			feature_id: featureId,
			name: "CV2 Diff Archived",
			type: FeatureType.Metered,
			consumable: true,
		};
		await deleteDbFeatures({ ctx, featureIds: [featureId] });

		try {
			await autumnV2_3.catalogV2.update({ features: [metered] });
			await autumnV2_3.catalogV2.update({
				features: [{ ...metered, archived: true }],
			});
			await expectDbFeatureArchived({ ctx, featureId });

			// Omitting archived while changing name must not silently unarchive
			expectCatalogPreviewCorrect({
				preview: await autumnV2_3.catalogV2.previewUpdate({
					features: [{ ...metered, name: "CV2 Diff Still Archived" }],
				}),
				features: [
					{
						featureId,
						action: "update",
						previousAttributes: { name: metered.name },
					},
				],
			});
			expectCatalogResultsCorrect({
				response: await autumnV2_3.catalogV2.update({
					features: [{ ...metered, name: "CV2 Diff Still Archived" }],
				}),
				features: [{ id: featureId, action: "update" }],
			});
			await expectDbFeatureArchived({ ctx, featureId });

			// Explicit archived: false unarchives and surfaces the flip
			expectCatalogPreviewCorrect({
				preview: await autumnV2_3.catalogV2.previewUpdate({
					features: [
						{
							...metered,
							name: "CV2 Diff Still Archived",
							archived: false,
						},
					],
				}),
				features: [
					{
						featureId,
						action: "update",
						previousAttributes: { archived: true },
					},
				],
			});
			expectCatalogResultsCorrect({
				response: await autumnV2_3.catalogV2.update({
					features: [
						{
							...metered,
							name: "CV2 Diff Still Archived",
							archived: false,
						},
					],
				}),
				features: [{ id: featureId, action: "update" }],
			});
			const dbFeatures = await FeatureService.list({
				db: ctx.db,
				orgId: ctx.org.id,
				env: ctx.env,
			});
			expect(dbFeatures.find((f) => f.id === featureId)?.archived).toBe(false);
		} finally {
			await deleteDbFeatures({ ctx, featureIds: [featureId] });
		}
	},
);
