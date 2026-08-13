/**
 * catalogV2.update / preview_update — remove_features error cases.
 *
 * Contract: upserting and removing one feature in the same call throws, and
 * removing an unknown feature id is a 404. Both fire before any write.
 * (A same-call credit system referencing a removed feature is NOT an error —
 * it archives; see remove-features.test.ts.)
 */

import { test } from "bun:test";
import { FeatureType } from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import {
	deleteDbFeatures,
	expectDbFeaturesCorrect,
} from "../../utils/expectCatalogFeatures.js";
import { uniqueTestId } from "../../utils/uniqueTestId.js";

const meteredFeature = (featureId: string) => ({
	feature_id: featureId,
	name: "CatalogV2 Remove Error Feature",
	type: FeatureType.Metered,
	consumable: true,
});

test.concurrent(
	`${chalk.yellowBright("catalogV2 remove features: upserting and removing the same feature in one call throws")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const featureId = uniqueTestId("cv2_rmerr_upsert");
		await deleteDbFeatures({ ctx, featureIds: [featureId] });

		try {
			await autumnV2_3.catalogV2.update({
				features: [meteredFeature(featureId)],
			});

			await expectAutumnError({
				errMessage: `Cannot update and remove feature ${featureId} in the same call`,
				func: () =>
					autumnV2_3.catalogV2.update({
						features: [meteredFeature(featureId)],
						remove_features: [{ feature_id: featureId }],
					}),
			});

			await expectDbFeaturesCorrect({
				ctx,
				expected: [{ id: featureId, type: FeatureType.Metered }],
			});
		} finally {
			await deleteDbFeatures({ ctx, featureIds: [featureId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 remove features: unknown feature id is a 404")}`,
	async () => {
		const { autumnV2_3 } = await initScenario({ setup: [], actions: [] });
		const missingId = uniqueTestId("cv2_rmerr_does_not_exist");

		await expectAutumnError({
			errCode: "feature_not_found",
			func: () =>
				autumnV2_3.catalogV2.update({
					remove_features: [{ feature_id: missingId }],
				}),
		});
		await expectAutumnError({
			errCode: "feature_not_found",
			func: () =>
				autumnV2_3.catalogV2.previewUpdate({
					remove_features: [{ feature_id: missingId }],
				}),
		});
	},
);
