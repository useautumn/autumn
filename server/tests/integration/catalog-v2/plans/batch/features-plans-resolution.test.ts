/**
 * catalogV2.update — same-call feature creates/renames resolving into plan items.
 *
 * Plan compute resolves items against the projected feature set (post
 * update/insert), so same-call creates and renames are visible and stale ids
 * are a 404 `feature_not_found`.
 */

import { expect, test } from "bun:test";
import { FeatureType, FeatureUsageType, ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";
import {
	deleteDbFeatures,
	expectDbFeaturesCorrect,
} from "../../utils/expectCatalogFeatures.js";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import {
	deleteDbPlans,
	expectCatalogPlansCorrect,
} from "../utils/expectCatalogPlans.js";

const getFull = async ({
	ctx,
	planId,
}: {
	ctx: AutumnContext;
	planId: string;
}) =>
	ProductService.getFull({
		db: ctx.db,
		idOrInternalId: planId,
		orgId: ctx.org.id,
		env: ctx.env,
	});

test.concurrent(
	`${chalk.yellowBright("catalogV2 interplay: create feature + plan item referencing it")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const featureId = uniqueTestId("cv2_int_feat");
		const planId = uniqueTestId("cv2_int_plan");
		await deleteDbFeatures({ ctx, featureIds: [featureId] });
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				features: [
					{
						feature_id: featureId,
						name: "Batch Feature",
						type: FeatureType.Metered,
						consumable: true,
					},
				],
				plans: [
					{
						plan_id: planId,
						name: "Uses New Feature",
						items: [
							{
								feature_id: featureId,
								included: 25,
								reset: { interval: ResetInterval.Month },
							},
						],
					},
				],
			});

			await expectDbFeaturesCorrect({
				ctx,
				expected: [
					{
						id: featureId,
						type: FeatureType.Metered,
						usageType: FeatureUsageType.Single,
					},
				],
			});
			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [
					{
						id: planId,
						featureIds: [featureId],
						allowances: { [featureId]: 25 },
					},
				],
			});

			const full = await getFull({ ctx, planId });
			const ent = full.entitlements.find((e) => e.feature.id === featureId);
			expect(
				ent,
				"entitlement should link batch-created feature",
			).toBeDefined();
			expect(ent?.feature.id).toBe(featureId);
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
			await deleteDbFeatures({ ctx, featureIds: [featureId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 interplay: metered + credit system + plan granting CS")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const meteredId = uniqueTestId("cv2_int_met");
		const creditSystemId = uniqueTestId("cv2_int_cs");
		const planId = uniqueTestId("cv2_int_cs_plan");
		await deleteDbFeatures({
			ctx,
			featureIds: [meteredId, creditSystemId],
		});
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				features: [
					{
						feature_id: meteredId,
						name: "Metered",
						type: FeatureType.Metered,
						consumable: true,
					},
					{
						feature_id: creditSystemId,
						name: "Credits",
						type: FeatureType.CreditSystem,
						credit_schema: [{ metered_feature_id: meteredId, credit_cost: 1 }],
					},
				],
				plans: [
					{
						plan_id: planId,
						name: "CS Plan",
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

			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [
					{
						id: planId,
						featureIds: [creditSystemId],
						allowances: { [creditSystemId]: 100 },
					},
				],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
			await deleteDbFeatures({
				ctx,
				featureIds: [meteredId, creditSystemId],
			});
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 interplay: rename F→G + plan item referencing G → resolves")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const fromId = uniqueTestId("cv2_int_ren_from");
		const toId = uniqueTestId("cv2_int_ren_to");
		const planId = uniqueTestId("cv2_int_ren_plan");
		await deleteDbFeatures({ ctx, featureIds: [fromId, toId] });
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				features: [
					{
						feature_id: fromId,
						name: "Old Id",
						type: FeatureType.Metered,
						consumable: true,
					},
				],
			});

			await autumnV2_3.catalogV2.update({
				features: [
					{
						feature_id: fromId,
						name: "Old Id",
						new_feature_id: toId,
						type: FeatureType.Metered,
						consumable: true,
					},
				],
				plans: [
					{
						plan_id: planId,
						name: "Uses Renamed",
						items: [
							{
								feature_id: toId,
								included: 5,
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
						featureIds: [toId],
						allowances: { [toId]: 5 },
					},
				],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
			await deleteDbFeatures({ ctx, featureIds: [fromId, toId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 interplay: rename F→G + plan item referencing F → error")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const fromId = uniqueTestId("cv2_int_old_from");
		const toId = uniqueTestId("cv2_int_old_to");
		const planId = uniqueTestId("cv2_int_old_plan");
		await deleteDbFeatures({ ctx, featureIds: [fromId, toId] });
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				features: [
					{
						feature_id: fromId,
						name: "Old Id",
						type: FeatureType.Metered,
						consumable: true,
					},
				],
			});

			await expectAutumnError({
				errCode: "feature_not_found",
				func: () =>
					autumnV2_3.catalogV2.update({
						features: [
							{
								feature_id: fromId,
								name: "Old Id",
								new_feature_id: toId,
								type: FeatureType.Metered,
								consumable: true,
							},
						],
						plans: [
							{
								plan_id: planId,
								name: "Uses Old Id",
								items: [
									{
										feature_id: fromId,
										included: 5,
										reset: { interval: ResetInterval.Month },
									},
								],
							},
						],
					}),
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
			await deleteDbFeatures({ ctx, featureIds: [fromId, toId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 interplay: plan uses pre-existing feature alongside unrelated feature ops")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const unrelatedFeatureId = uniqueTestId("cv2_int_unrel");
		const planId = uniqueTestId("cv2_int_unrel_plan");
		await deleteDbFeatures({ ctx, featureIds: [unrelatedFeatureId] });
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				features: [
					{
						feature_id: unrelatedFeatureId,
						name: "Unrelated",
						type: FeatureType.Boolean,
					},
				],
				plans: [
					{
						plan_id: planId,
						name: "Uses Existing",
						items: [
							{
								feature_id: TestFeature.Messages,
								included: 15,
								reset: { interval: ResetInterval.Month },
							},
						],
					},
				],
			});

			await expectDbFeaturesCorrect({
				ctx,
				expected: [{ id: unrelatedFeatureId, type: FeatureType.Boolean }],
			});
			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [
					{
						id: planId,
						featureIds: [TestFeature.Messages],
						allowances: { [TestFeature.Messages]: 15 },
					},
				],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
			await deleteDbFeatures({ ctx, featureIds: [unrelatedFeatureId] });
		}
	},
);
