/**
 * catalogV2.preview_update — plan-body conflicts and license-slot
 * conflicts must not be confused.
 *
 * Plan-only items edit: variant.conflicts fires (no license_plan_id), Seat stays 200.
 * License-only edit: Seat overlay moves, conflict stamps license_plan_id.
 * Both lanes: two objects — plan body, then the Seat link.
 */

import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../../utils/uniqueTestId.js";
import { expectLicenseLinkCorrect } from "../../../licenses/utils/expectLicenseLinkCorrect.js";
import {
	messagesItem,
	messagesOverride,
	withCatalogPlans,
} from "../../../licenses/utils/seedLicensePlans.js";
import {
	expectPlanPreviewRowCorrect,
	parsePlanPreview,
} from "../../../preview/utils/expectPlanPreview.js";
import { expectVariantPlanCorrect } from "../../utils/expectVariantPointer.js";
import { seedBaseVariantWithChildLicense } from "../../utils/seedVariantPlans.js";

const messagesValueDivergence = {
	reason: "value_divergence" as const,
	feature_name: "Messages",
	item_filter: { feature_id: TestFeature.Messages },
};

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: plan-only 100→150 conflicts on the plan, Seat stays 200")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_iso_plan");
		const variantId = uniqueTestId("cv2_var_iso_plan_eu");
		const childId = uniqueTestId("cv2_var_iso_plan_seat");
		await withCatalogPlans({
			ctx,
			planIds: [baseId, variantId, childId],
			run: async () => {
				await seedBaseVariantWithChildLicense({
					autumn: autumnV2_3,
					baseId,
					variantId,
					childId,
				});
				const params = {
					plans: [
						{
							plan_id: baseId,
							items: [messagesItem(150)],
							propagate: { variants: [{ plan_id: variantId, version: 1 }] },
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
								planId: variantId,
								variantAction: "propagated",
								conflicts: [messagesValueDivergence],
								licenseChanges: null,
							},
						],
					},
				});
				await autumnV2_3.catalogV2.update(params);
				await expectVariantPlanCorrect({
					ctx,
					variantPlanId: variantId,
					allowances: { [TestFeature.Messages]: 150 },
				});
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: variantId,
					licensePlanId: childId,
					messagesAllowance: 200,
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: license-only 100→150 moves Seat, plan items stay 200")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_iso_lic");
		const variantId = uniqueTestId("cv2_var_iso_lic_eu");
		const childId = uniqueTestId("cv2_var_iso_lic_seat");
		await withCatalogPlans({
			ctx,
			planIds: [baseId, variantId, childId],
			run: async () => {
				await seedBaseVariantWithChildLicense({
					autumn: autumnV2_3,
					baseId,
					variantId,
					childId,
				});
				const params = {
					plans: [
						{
							plan_id: baseId,
							licenses: [
								{
									license_plan_id: childId,
									included: 2,
									customize: messagesOverride(150),
								},
							],
							propagate: { variants: [{ plan_id: variantId, version: 1 }] },
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
								planId: variantId,
								variantAction: "propagated",
								conflicts: [
									{
										...messagesValueDivergence,
										license_plan_id: childId,
									},
								],
								licenseChanges: [
									{
										action: "updated",
										license_plan_id: childId,
									},
								],
							},
						],
					},
				});
				await autumnV2_3.catalogV2.update(params);
				await expectVariantPlanCorrect({
					ctx,
					variantPlanId: variantId,
					allowances: { [TestFeature.Messages]: 200 },
				});
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: variantId,
					licensePlanId: childId,
					messagesAllowance: 150,
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: plan + license both diverge → two conflict objects")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_iso_both");
		const variantId = uniqueTestId("cv2_var_iso_both_eu");
		const childId = uniqueTestId("cv2_var_iso_both_seat");
		await withCatalogPlans({
			ctx,
			planIds: [baseId, variantId, childId],
			run: async () => {
				await seedBaseVariantWithChildLicense({
					autumn: autumnV2_3,
					baseId,
					variantId,
					childId,
				});
				const params = {
					plans: [
						{
							plan_id: baseId,
							items: [messagesItem(150)],
							licenses: [
								{
									license_plan_id: childId,
									included: 2,
									customize: messagesOverride(150),
								},
							],
							propagate: { variants: [{ plan_id: variantId, version: 1 }] },
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
								planId: variantId,
								variantAction: "propagated",
								conflicts: [
									messagesValueDivergence,
									{
										...messagesValueDivergence,
										license_plan_id: childId,
									},
								],
							},
						],
					},
				});
				await autumnV2_3.catalogV2.update(params);
				await expectVariantPlanCorrect({
					ctx,
					variantPlanId: variantId,
					allowances: { [TestFeature.Messages]: 150 },
				});
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: variantId,
					licensePlanId: childId,
					messagesAllowance: 150,
				});
			},
		});
	},
);
