/**
 * catalogV2.preview_update — projected credit_systems usage (batch-aware).
 */

import { test } from "bun:test";
import { FeatureType } from "@autumn/shared";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { deleteDbFeatures } from "../../utils/expectCatalogFeatures.js";
import { expectCatalogPreviewCorrect } from "../../utils/expectCatalogUpdate.js";
import { uniqueTestId } from "../../utils/uniqueTestId.js";

const meteredFeature = (featureId: string) => ({
	feature_id: featureId,
	name: "CatalogV2 Preview Projected Feature",
	type: FeatureType.Metered,
	consumable: true,
});

const creditSystemFeature = ({
	featureId,
	name = "CatalogV2 Preview Projected Credits",
	meteredFeatureIds,
}: {
	featureId: string;
	name?: string;
	meteredFeatureIds: string[];
}) => ({
	feature_id: featureId,
	name,
	type: FeatureType.CreditSystem,
	credit_schema: meteredFeatureIds.map((meteredFeatureId) => ({
		metered_feature_id: meteredFeatureId,
		credit_cost: 1,
	})),
});

const renameCreditSystem = ({
	from,
	to,
	meteredFeatureIds,
}: {
	from: string;
	to: string;
	meteredFeatureIds: string[];
}) => ({
	...creditSystemFeature({
		featureId: from,
		meteredFeatureIds,
	}),
	new_feature_id: to,
});

test.concurrent(
	`${chalk.yellowBright("catalogV2 remove preview: same-call CREATE CS archives removed feature with projected CS usage")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const meteredId = uniqueTestId("cv2_proj_create_cs_met");
		const creditSystemId = uniqueTestId("cv2_proj_create_cs");
		const featureIds = [creditSystemId, meteredId];
		await deleteDbFeatures({ ctx, featureIds });

		try {
			await autumnV2_3.catalogV2.update({
				features: [meteredFeature(meteredId)],
			});

			const csName = "CatalogV2 Preview Same-Call New Credits";
			const preview = await autumnV2_3.catalogV2.previewUpdate({
				features: [
					creditSystemFeature({
						featureId: creditSystemId,
						name: csName,
						meteredFeatureIds: [meteredId],
					}),
				],
				remove_features: [{ feature_id: meteredId }],
			});

			expectCatalogPreviewCorrect({
				preview,
				features: [
					{ featureId: creditSystemId, action: "create" },
					{
						featureId: meteredId,
						action: "delete",
						willArchive: true,
						usage: {
							creditSystems: { count: 1, sampleIds: [creditSystemId] },
						},
						reasonsInclude: [
							`Credit system "${csName}" references this feature.`,
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
	`${chalk.yellowBright("catalogV2 remove preview: same-call REMOVE CS clears projected credit_systems usage")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const meteredId = uniqueTestId("cv2_proj_rm_cs_met");
		const creditSystemId = uniqueTestId("cv2_proj_rm_cs");
		const featureIds = [creditSystemId, meteredId];
		await deleteDbFeatures({ ctx, featureIds });

		try {
			await autumnV2_3.catalogV2.update({
				features: [
					meteredFeature(meteredId),
					creditSystemFeature({
						featureId: creditSystemId,
						meteredFeatureIds: [meteredId],
					}),
				],
			});

			const preview = await autumnV2_3.catalogV2.previewUpdate({
				remove_features: [
					{ feature_id: creditSystemId },
					{ feature_id: meteredId },
				],
			});

			expectCatalogPreviewCorrect({
				preview,
				features: [
					{
						featureId: creditSystemId,
						action: "delete",
						willArchive: false,
					},
					{
						featureId: meteredId,
						action: "delete",
						willArchive: false,
						usage: { creditSystems: { count: 0 } },
						reasonMessages: [],
					},
				],
			});
		} finally {
			await deleteDbFeatures({ ctx, featureIds });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 remove preview: same-call UPDATE CS drop clears projected credit_systems usage")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const meteredId = uniqueTestId("cv2_proj_drop_met");
		const keeperId = uniqueTestId("cv2_proj_drop_kept");
		const creditSystemId = uniqueTestId("cv2_proj_drop_cs");
		const featureIds = [creditSystemId, meteredId, keeperId];
		await deleteDbFeatures({ ctx, featureIds });

		try {
			await autumnV2_3.catalogV2.update({
				features: [
					meteredFeature(meteredId),
					meteredFeature(keeperId),
					creditSystemFeature({
						featureId: creditSystemId,
						meteredFeatureIds: [meteredId, keeperId],
					}),
				],
			});

			const preview = await autumnV2_3.catalogV2.previewUpdate({
				features: [
					creditSystemFeature({
						featureId: creditSystemId,
						meteredFeatureIds: [keeperId],
					}),
				],
				remove_features: [{ feature_id: meteredId }],
			});

			expectCatalogPreviewCorrect({
				preview,
				features: [
					{ featureId: creditSystemId, action: "update" },
					{
						featureId: meteredId,
						action: "delete",
						willArchive: false,
						usage: { creditSystems: { count: 0 } },
					},
				],
			});
		} finally {
			await deleteDbFeatures({ ctx, featureIds });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 remove preview: same-call RENAME CS samples the projected new CS id")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const meteredId = uniqueTestId("cv2_proj_rn_cs_met");
		const oldCsId = uniqueTestId("cv2_proj_rn_cs_old");
		const newCsId = uniqueTestId("cv2_proj_rn_cs_new");
		const featureIds = [oldCsId, newCsId, meteredId];
		await deleteDbFeatures({ ctx, featureIds });

		try {
			await autumnV2_3.catalogV2.update({
				features: [
					meteredFeature(meteredId),
					creditSystemFeature({
						featureId: oldCsId,
						meteredFeatureIds: [meteredId],
					}),
				],
			});

			const preview = await autumnV2_3.catalogV2.previewUpdate({
				features: [
					renameCreditSystem({
						from: oldCsId,
						to: newCsId,
						meteredFeatureIds: [meteredId],
					}),
				],
				remove_features: [{ feature_id: meteredId }],
			});

			expectCatalogPreviewCorrect({
				preview,
				features: [
					{
						featureId: newCsId,
						action: "update",
						previousAttributes: { id: oldCsId },
					},
					{
						featureId: meteredId,
						action: "delete",
						willArchive: true,
						usage: {
							creditSystems: { count: 1, sampleIds: [newCsId] },
						},
					},
				],
			});
		} finally {
			await deleteDbFeatures({ ctx, featureIds });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 create preview: same-call CREATE feature + CS projects credit_systems usage")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const meteredId = uniqueTestId("cv2_proj_create_both_met");
		const creditSystemId = uniqueTestId("cv2_proj_create_both_cs");
		const featureIds = [creditSystemId, meteredId];
		await deleteDbFeatures({ ctx, featureIds });

		try {
			const preview = await autumnV2_3.catalogV2.previewUpdate({
				features: [
					meteredFeature(meteredId),
					creditSystemFeature({
						featureId: creditSystemId,
						meteredFeatureIds: [meteredId],
					}),
				],
			});

			expectCatalogPreviewCorrect({
				preview,
				features: [
					{
						featureId: meteredId,
						action: "create",
						usage: {
							plans: { count: 0 },
							customers: { count: 0 },
							creditSystems: { count: 1 },
						},
						reasonMessages: [],
					},
					{ featureId: creditSystemId, action: "create" },
				],
			});
		} finally {
			await deleteDbFeatures({ ctx, featureIds });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 remove preview: credit_systems usage caps at 3 with 2 samples")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const meteredId = uniqueTestId("cv2_proj_cs_cap_met");
		const creditSystemIds = Array.from({ length: 4 }, (_, index) =>
			uniqueTestId(`cv2_proj_cs_cap_${index}`),
		);
		const featureIds = [...creditSystemIds, meteredId];
		await deleteDbFeatures({ ctx, featureIds });

		try {
			await autumnV2_3.catalogV2.update({
				features: [
					meteredFeature(meteredId),
					...creditSystemIds.map((creditSystemId, index) =>
						creditSystemFeature({
							featureId: creditSystemId,
							name: `CatalogV2 Preview CS Cap ${index}`,
							meteredFeatureIds: [meteredId],
						}),
					),
				],
			});

			const preview = await autumnV2_3.catalogV2.previewUpdate({
				remove_features: [{ feature_id: meteredId }],
			});

			expectCatalogPreviewCorrect({
				preview,
				features: [
					{
						featureId: meteredId,
						action: "delete",
						willArchive: true,
						usage: {
							creditSystems: {
								count: 3,
								countCapped: true,
								sampleCount: 2,
							},
						},
					},
				],
			});
		} finally {
			await deleteDbFeatures({ ctx, featureIds });
		}
	},
);
