/**
 * catalogV2.update / preview_update — the `combine` setting (sum / max / min),
 * the path `atmn push` takes.
 *
 * Contract:
 *   - Creating a feature with `combine` stores it; the response echoes it.
 *   - Changing it previews as `update` with `previous_attributes.combine`, applies,
 *     and an identical re-send is `none`.
 *   - Setting it back to sum unsets it (omitted from the response).
 *   - Switching a feature customers already hold to `min` is allowed, and their
 *     plans start competing on the next plan change: 48 held, 24 attached → 24.
 *   - Moving a feature customers hold off max / min (to sum, or max ↔ min) is
 *     blocked: their pools were built under the old rule.
 */

import { test } from "bun:test";
import {
	type AttachParamsV1Input,
	FeatureCombine,
	FeatureType,
	FeatureUsageType,
} from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import {
	deleteDbFeatures,
	expectDbFeaturesCorrect,
} from "../../utils/expectCatalogFeatures.js";
import {
	expectCatalogPreviewCorrect,
	expectCatalogResultsCorrect,
} from "../../utils/expectCatalogUpdate.js";
import { uniqueTestId } from "../../utils/uniqueTestId.js";

const hoursFeature = (featureId: string, combine?: FeatureCombine) => ({
	feature_id: featureId,
	name: "CatalogV2 Refresh Hours",
	type: FeatureType.Metered,
	consumable: false,
	...(combine ? { combine } : {}),
});

test.concurrent(
	`${chalk.yellowBright("catalogV2 combine: create, change, re-send and unset")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const featureId = uniqueTestId("cv2_combine");
		await deleteDbFeatures({ ctx, featureIds: [featureId] });

		try {
			const created = await autumnV2_3.catalogV2.update({
				features: [hoursFeature(featureId, FeatureCombine.Min)],
			});
			expectCatalogResultsCorrect({
				response: created,
				features: [{ id: featureId, action: "create" }],
			});
			await expectDbFeaturesCorrect({
				ctx,
				expected: [
					{
						id: featureId,
						type: FeatureType.Metered,
						usageType: FeatureUsageType.Continuous,
						combine: FeatureCombine.Min,
					},
				],
			});

			expectCatalogPreviewCorrect({
				preview: await autumnV2_3.catalogV2.previewUpdate({
					features: [hoursFeature(featureId, FeatureCombine.Max)],
				}),
				features: [
					{
						featureId,
						action: "update",
						previousAttributes: { combine: FeatureCombine.Min },
					},
				],
			});
			expectCatalogResultsCorrect({
				response: await autumnV2_3.catalogV2.update({
					features: [hoursFeature(featureId, FeatureCombine.Max)],
				}),
				features: [{ id: featureId, action: "update" }],
			});
			await expectDbFeaturesCorrect({
				ctx,
				expected: [
					{
						id: featureId,
						type: FeatureType.Metered,
						combine: FeatureCombine.Max,
					},
				],
			});

			expectCatalogResultsCorrect({
				response: await autumnV2_3.catalogV2.update({
					features: [hoursFeature(featureId, FeatureCombine.Max)],
				}),
				features: [{ id: featureId, action: "none" }],
			});

			expectCatalogResultsCorrect({
				response: await autumnV2_3.catalogV2.update({
					features: [hoursFeature(featureId, FeatureCombine.Sum)],
				}),
				features: [{ id: featureId, action: "update" }],
			});
			await expectDbFeaturesCorrect({
				ctx,
				expected: [{ id: featureId, type: FeatureType.Metered, combine: null }],
			});
		} finally {
			await deleteDbFeatures({ ctx, featureIds: [featureId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 combine: switching a held feature to min, then away from it")}`,
	async () => {
		const featureId = uniqueTestId("cv2_combine_held");
		const customerId = uniqueTestId("cv2-combine-held");
		const hours = (amount: number) =>
			constructFeatureItem({
				featureId,
				includedUsage: amount,
				interval: null,
			});
		const start = products.base({
			id: uniqueTestId("cv2_combine_start"),
			items: [hours(48)],
		});
		const run = products.base({
			id: uniqueTestId("cv2_combine_run"),
			isAddOn: true,
			items: [hours(24)],
		});

		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		await deleteDbFeatures({ ctx, featureIds: [featureId] });
		await autumnV2_3.catalogV2.update({ features: [hoursFeature(featureId)] });

		try {
			await initScenario({
				customerId,
				setup: [
					s.customer({ testClock: false }),
					s.products({ list: [start, run] }),
				],
				actions: [s.billing.attach({ productId: start.id })],
			});

			expectCatalogResultsCorrect({
				response: await autumnV2_3.catalogV2.update({
					features: [hoursFeature(featureId, FeatureCombine.Min)],
				}),
				features: [{ id: featureId, action: "update" }],
			});

			await autumnV2_3.billing.attach<AttachParamsV1Input>({
				customer_id: customerId,
				plan_id: run.id,
			});
			await expectBalanceCorrect({
				customerId,
				autumn: autumnV2_3,
				featureId,
				granted: 24,
				remaining: 24,
			});

			for (const combine of [FeatureCombine.Sum, FeatureCombine.Max]) {
				await expectAutumnError({
					errCode: "invalid_feature",
					func: () =>
						autumnV2_3.catalogV2.update({
							features: [hoursFeature(featureId, combine)],
						}),
				});
			}
			await expectDbFeaturesCorrect({
				ctx,
				expected: [
					{
						id: featureId,
						type: FeatureType.Metered,
						combine: FeatureCombine.Min,
					},
				],
			});
			await expectBalanceCorrect({
				customerId,
				autumn: autumnV2_3,
				featureId,
				granted: 24,
			});
		} finally {
			await autumnV2_3.customers.delete(customerId).catch(() => {});
		}
	},
);
