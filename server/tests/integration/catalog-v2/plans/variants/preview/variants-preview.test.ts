/**
 * catalogV2.preview_update — variants[] nest on the base row.
 *
 * Contract:
 *   always list every latest variant
 *   variant_action: explicit | propagated | unchanged
 *   follow-only overlapping slot → conflicts; explicit swallows them
 *   preview writes nothing
 */

import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import { deleteDbPlans } from "../../utils/expectCatalogPlans.js";
import {
	expectPlanPreviewRowCorrect,
	parsePlanPreview,
} from "../../preview/utils/expectPlanPreview.js";
import { dashboardItem, messagesItem } from "../../licenses/utils/seedLicensePlans.js";
import { expectVariantPlanCorrect } from "../utils/expectVariantPointer.js";
import { seedBaseWithVariant } from "../utils/seedVariantPlans.js";

const messagesValueDivergence = {
	reason: "value_divergence" as const,
	feature_name: "Messages",
	item_filter: { feature_id: TestFeature.Messages },
};

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants preview: two variants, only listed is propagated")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_prv_two");
		const listedId = uniqueTestId("cv2_var_prv_two_a");
		const pinnedId = uniqueTestId("cv2_var_prv_two_b");
		await deleteDbPlans({ ctx, planIds: [baseId, listedId, pinnedId] });
		try {
			await seedBaseWithVariant({
				autumn: autumnV2_3,
				baseId,
				variantId: listedId,
			});
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: baseId,
						variants: [{ variant_plan_id: pinnedId, name: "Team UK" }],
					},
				],
			});
			const params = {
				plans: [
					{
						plan_id: baseId,
						items: [messagesItem(100), dashboardItem()],
						propagate: { variants: [{ plan_id: listedId }] },
					},
				],
			};
			const preview = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate(params),
			);
			expectPlanPreviewRowCorrect({
				preview,
				expected: {
					planId: baseId,
					variants: [
						{
							planId: listedId,
							variantAction: "propagated",
							hasPlanChange: true,
						},
						{
							planId: pinnedId,
							variantAction: "unchanged",
							hasPlanChange: false,
						},
					],
				},
			});
			await autumnV2_3.catalogV2.update(params);
			await expectVariantPlanCorrect({
				ctx,
				variantPlanId: listedId,
				featureIds: [TestFeature.Messages, TestFeature.Dashboard],
			});
			await expectVariantPlanCorrect({
				ctx,
				variantPlanId: pinnedId,
				featureIds: [TestFeature.Messages],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, listedId, pinnedId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants preview: propagated overlapping slot lists value_divergence")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_prv_div");
		const variantId = uniqueTestId("cv2_var_prv_div_eu");
		await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		try {
			await seedBaseWithVariant({
				autumn: autumnV2_3,
				baseId,
				variantId,
			});
			const preview = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [
						{
							plan_id: baseId,
							items: [messagesItem(150)],
							propagate: { variants: [{ plan_id: variantId }] },
						},
					],
				}),
			);
			expectPlanPreviewRowCorrect({
				preview,
				expected: {
					planId: baseId,
					variants: [
						{
							planId: variantId,
							variantAction: "propagated",
							conflicts: [messagesValueDivergence],
						},
					],
				},
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants preview: declared customize is explicit and omits conflicts")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_prv_ex");
		const variantId = uniqueTestId("cv2_var_prv_ex_eu");
		await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		try {
			await seedBaseWithVariant({
				autumn: autumnV2_3,
				baseId,
				variantId,
			});
			const preview = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [
						{
							plan_id: baseId,
							items: [messagesItem(150), dashboardItem()],
							variants: [
								{
									variant_plan_id: variantId,
									customize: {
										remove_items: [{ feature_id: TestFeature.Messages }],
										add_items: [messagesItem(300)],
									},
								},
							],
							propagate: { variants: [{ plan_id: variantId }] },
						},
					],
				}),
			);
			expectPlanPreviewRowCorrect({
				preview,
				expected: {
					planId: baseId,
					variants: [
						{
							planId: variantId,
							variantAction: "explicit",
							conflicts: null,
							hasPlanChange: true,
						},
					],
				},
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants preview: preview_update writes nothing")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_prv_nowrite");
		const variantId = uniqueTestId("cv2_var_prv_nowrite_eu");
		await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		try {
			await seedBaseWithVariant({
				autumn: autumnV2_3,
				baseId,
				variantId,
			});
			await autumnV2_3.catalogV2.previewUpdate({
				plans: [
					{
						plan_id: baseId,
						items: [messagesItem(100), dashboardItem()],
						propagate: { variants: [{ plan_id: variantId }] },
					},
				],
			});
			await expectVariantPlanCorrect({
				ctx,
				variantPlanId: variantId,
				allowances: { [TestFeature.Messages]: 200 },
				featureIds: [TestFeature.Messages],
			});
			expect(
				(await autumnV2_3.catalogV2.get()).plans.find(
					(plan: { id: string }) => plan.id === variantId,
				),
			).toBeUndefined();
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		}
	},
);
