/**
 * catalogV2.update — feature type changes and removals × plan upsert in one call.
 *
 * Plan compute resolves items against the projected feature set (post
 * update/remove), so type changes are visible to same-call items and removed
 * ids are a 404 `feature_not_found`.
 */

import { expect, test } from "bun:test";
import { FeatureType, ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import {
	deleteDbFeatures,
	expectDbFeaturesCorrect,
} from "../../utils/expectCatalogFeatures.js";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import {
	deleteDbPlans,
	expectCatalogPlansCorrect,
} from "../utils/expectCatalogPlans.js";

// Works today: feature already exists in ctx.features; type update + plan item land.
test.concurrent(
	`${chalk.yellowBright("catalogV2 interplay: boolean→metered + plan item with metered config")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const featureId = uniqueTestId("cv2_int_type");
		const planId = uniqueTestId("cv2_int_type_plan");
		await deleteDbFeatures({ ctx, featureIds: [featureId] });
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				features: [
					{
						feature_id: featureId,
						name: "Was Boolean",
						type: FeatureType.Boolean,
					},
				],
			});

			await autumnV2_3.catalogV2.update({
				features: [
					{
						feature_id: featureId,
						name: "Now Metered",
						type: FeatureType.Metered,
						consumable: true,
					},
				],
				plans: [
					{
						plan_id: planId,
						name: "Metered Item",
						items: [
							{
								feature_id: featureId,
								included: 40,
								reset: { interval: ResetInterval.Month },
							},
						],
					},
				],
			});

			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [
					{
						id: planId,
						featureIds: [featureId],
						allowances: { [featureId]: 40 },
					},
				],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
			await deleteDbFeatures({ ctx, featureIds: [featureId] });
		}
	},
);

// No validateProductItems rule rejects metered config on a boolean feature
// (only pooled booleans); today included/reset persist as-is instead of coercing.
test.concurrent(
	`${chalk.yellowBright("RED: catalogV2 interplay: metered→boolean + plan item with metered config → boolean item")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const featureId = uniqueTestId("cv2_int_mtb");
		const planId = uniqueTestId("cv2_int_mtb_plan");
		await deleteDbFeatures({ ctx, featureIds: [featureId] });
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				features: [
					{
						feature_id: featureId,
						name: "Was Metered",
						type: FeatureType.Metered,
						consumable: true,
					},
				],
			});

			await autumnV2_3.catalogV2.update({
				features: [
					{
						feature_id: featureId,
						name: "Now Boolean",
						type: FeatureType.Boolean,
					},
				],
				plans: [
					{
						plan_id: planId,
						name: "Boolean Item",
						items: [
							{
								feature_id: featureId,
								included: 100,
								reset: { interval: ResetInterval.Month },
							},
						],
					},
				],
			});

			await expectDbFeaturesCorrect({
				ctx,
				expected: [{ id: featureId, type: FeatureType.Boolean }],
			});

			const catalog = await autumnV2_3.catalogV2.get({
				include_archived: true,
			});
			const plan = catalog.plans.find((p) => p.id === planId);
			expect(plan, `missing plan ${planId}`).toBeDefined();
			const item = plan?.items.find((i) => i.feature_id === featureId);
			expect(item, "item should exist for boolean feature").toBeDefined();
			expect(item?.included ?? null).toBeNull();
			expect(item?.reset ?? null).toBeNull();
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
			await deleteDbFeatures({ ctx, featureIds: [featureId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 interplay: remove feature + plan still referencing it → error")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const featureId = uniqueTestId("cv2_int_rm_ref");
		const planId = uniqueTestId("cv2_int_rm_ref_plan");
		await deleteDbFeatures({ ctx, featureIds: [featureId] });
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				features: [
					{
						feature_id: featureId,
						name: "To Remove",
						type: FeatureType.Metered,
						consumable: true,
					},
				],
			});
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Has Feature",
						items: [
							{
								feature_id: featureId,
								included: 10,
								reset: { interval: ResetInterval.Month },
							},
						],
					},
				],
			});

			await expectAutumnError({
				errCode: "feature_not_found",
				func: () =>
					autumnV2_3.catalogV2.update({
						remove_features: [{ feature_id: featureId }],
						plans: [
							{
								plan_id: planId,
								name: "Still Has Feature",
								items: [
									{
										feature_id: featureId,
										included: 10,
										reset: { interval: ResetInterval.Month },
									},
								],
							},
						],
					}),
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
			await deleteDbFeatures({ ctx, featureIds: [featureId] });
		}
	},
);

// Spec: the remove+upsert same-call guard (invalid_feature) should win. Today plan
// item resolution 404s first (feature_not_found), so the error depends on plan refs.
test.concurrent(
	`${chalk.yellowBright("RED: catalogV2 interplay: remove + recreate feature + plan referencing it → same-call conflict error")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const featureId = uniqueTestId("cv2_int_rm_rc");
		const planId = uniqueTestId("cv2_int_rm_rc_plan");
		await deleteDbFeatures({ ctx, featureIds: [featureId] });
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				features: [
					{
						feature_id: featureId,
						name: "Original",
						type: FeatureType.Metered,
						consumable: true,
					},
				],
			});

			await expectAutumnError({
				errCode: "invalid_feature",
				func: () =>
					autumnV2_3.catalogV2.update({
						remove_features: [{ feature_id: featureId }],
						features: [
							{
								feature_id: featureId,
								name: "Recreated",
								type: FeatureType.Metered,
								consumable: true,
							},
						],
						plans: [
							{
								plan_id: planId,
								name: "Uses Recreated",
								items: [
									{
										feature_id: featureId,
										included: 10,
										reset: { interval: ResetInterval.Month },
									},
								],
							},
						],
					}),
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
			await deleteDbFeatures({ ctx, featureIds: [featureId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 interplay: remove feature + plan drops its item → OK")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const featureId = uniqueTestId("cv2_int_rm_drop");
		const planId = uniqueTestId("cv2_int_rm_drop_plan");
		await deleteDbFeatures({ ctx, featureIds: [featureId] });
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				features: [
					{
						feature_id: featureId,
						name: "Drop Me",
						type: FeatureType.Metered,
						consumable: true,
					},
				],
			});
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Has Both",
						items: [
							{ feature_id: TestFeature.Dashboard },
							{
								feature_id: featureId,
								included: 10,
								reset: { interval: ResetInterval.Month },
							},
						],
					},
				],
			});

			await autumnV2_3.catalogV2.update({
				remove_features: [{ feature_id: featureId }],
				plans: [
					{
						plan_id: planId,
						items: [{ feature_id: TestFeature.Dashboard }],
					},
				],
			});

			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [
					{
						id: planId,
						featureIds: [TestFeature.Dashboard],
					},
				],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
			await deleteDbFeatures({ ctx, featureIds: [featureId] });
		}
	},
);
