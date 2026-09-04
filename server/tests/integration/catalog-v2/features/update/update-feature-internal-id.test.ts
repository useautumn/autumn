/**
 * catalogV2.update / preview_update — addressing a feature by internal_id.
 *
 * Contract:
 *   I1  create → preview has no id yet (null); the applied result carries the
 *       DB row's, and a later preview of the existing row carries the same
 *   I2  internal_id + a different feature_id is a rename: old id gone, new id
 *       present, same internal_id, reported as "update" with the old id in
 *       previous_attributes
 *   I3  internal_id + the same feature_id is a no-op ("none")
 *   I4  an unknown internal_id is refused, naming the id
 */

import { expect, test } from "bun:test";
import { FeatureType } from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { FeatureService } from "@/internal/features/FeatureService.js";
import {
	deleteDbFeatures,
	expectDbFeaturesAbsent,
	expectDbFeaturesCorrect,
} from "../../utils/expectCatalogFeatures.js";
import {
	expectCatalogPreviewCorrect,
	expectCatalogResultsCorrect,
} from "../../utils/expectCatalogUpdate.js";
import { uniqueTestId } from "../../utils/uniqueTestId.js";

const consumableFeature = (featureId: string) => ({
	feature_id: featureId,
	name: "CatalogV2 Internal Id",
	type: FeatureType.Metered,
	consumable: true,
});

test.concurrent(
	`${chalk.yellowBright("catalogV2 internal_id: rows are addressed by their stable id, and a differing feature_id renames")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const oldId = uniqueTestId("cv2_iid_old");
		const newId = uniqueTestId("cv2_iid_new");
		const featureIds = [oldId, newId];
		await deleteDbFeatures({ ctx, featureIds });

		const dbRow = async (id: string) =>
			(
				await FeatureService.list({
					db: ctx.db,
					orgId: ctx.org.id,
					env: ctx.env,
				})
			).find((candidate) => candidate.id === id);

		try {
			// I1: the id is known at preview time and stable through apply
			const preview = await autumnV2_3.catalogV2.previewUpdate({
				features: [consumableFeature(oldId)],
			});
			const previewRow = preview.features.find(
				(row) => row.feature_id === oldId,
			);
			expect(previewRow?.action).toBe("create");
			// A create has no stable id until it is applied.
			expect(previewRow?.internal_id).toBeNull();

			const applied = await autumnV2_3.catalogV2.update({
				features: [consumableFeature(oldId)],
			});
			const created = await dbRow(oldId);
			const internalId = created?.internal_id;
			expect(typeof internalId).toBe("string");
			expect(
				applied.results.features.find((row) => row.id === oldId)?.internal_id,
			).toBe(internalId);

			// An existing row's id is stable in preview too.
			const unchangedPreview = await autumnV2_3.catalogV2.previewUpdate({
				features: [consumableFeature(oldId)],
			});
			expect(
				unchangedPreview.features.find((row) => row.feature_id === oldId)
					?.internal_id,
			).toBe(internalId);

			// I2: same row, new public id
			const renamed = { ...consumableFeature(newId), internal_id: internalId };
			expectCatalogPreviewCorrect({
				preview: await autumnV2_3.catalogV2.previewUpdate({
					features: [renamed],
				}),
				features: [
					{
						featureId: newId,
						action: "update",
						hasCustomerEntitlements: false,
						previousAttributes: { id: oldId },
					},
				],
			});
			expectCatalogResultsCorrect({
				response: await autumnV2_3.catalogV2.update({ features: [renamed] }),
				features: [{ id: newId, action: "update" }],
			});
			await expectDbFeaturesCorrect({
				ctx,
				expected: [{ id: newId, type: FeatureType.Metered }],
			});
			await expectDbFeaturesAbsent({ ctx, featureIds: [oldId] });
			expect((await dbRow(newId))?.internal_id).toBe(internalId);

			// I3: same row, same id → nothing to do
			expectCatalogResultsCorrect({
				response: await autumnV2_3.catalogV2.update({ features: [renamed] }),
				features: [{ id: newId, action: "none" }],
			});

			// I4: an id nothing owns is a caller bug, not a create
			await expectAutumnError({
				errMessage: "fe_does_not_exist",
				func: () =>
					autumnV2_3.catalogV2.previewUpdate({
						features: [
							{ ...consumableFeature(newId), internal_id: "fe_does_not_exist" },
						],
					}),
			});
		} finally {
			await deleteDbFeatures({ ctx, featureIds });
		}
	},
);
