/**
 * catalogV2.preview_update — variants[].plan_change.license_changes is
 * Team-EU's Seat effective before→after, not Team's customize copied.
 *
 * Red (current):  missing nest / stacked Team 100 / pin emits a write
 * Green (after):  Dashboard-only item_change; 200→150 nest; pin has no license_changes
 */

import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import {
	expectPlanPreviewRowCorrect,
	parsePlanPreview,
} from "../../preview/utils/expectPlanPreview.js";
import {
	dashboardItem,
	messagesItem,
	messagesOverride,
	withCatalogPlans,
} from "../../licenses/utils/seedLicensePlans.js";
import { seedBaseVariantWithChildLicense } from "../utils/seedVariantPlans.js";

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants preview: follow add Dashboard nests created Dashboard, not messages")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_plc_dash");
		const variantId = uniqueTestId("cv2_var_plc_dash_eu");
		const childId = uniqueTestId("cv2_var_plc_dash_seat");
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
				const preview = parsePlanPreview(
					await autumnV2_3.catalogV2.previewUpdate({
						plans: [
							{
								plan_id: baseId,
								licenses: [
									{
										license_plan_id: childId,
										included: 2,
										customize: {
											remove_items: [{ feature_id: TestFeature.Messages }],
											add_items: [messagesItem(100), dashboardItem()],
										},
									},
								],
								propagate: { variants: [{ plan_id: variantId, version: 1 }] },
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
								licenseChanges: [
									{
										action: "updated",
										license_plan_id: childId,
									},
								],
								nestedItemChanges: [
									{
										action: "created",
										feature_id: TestFeature.Dashboard,
									},
								],
							},
						],
					},
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants preview: follow 100→150 nests Seat messages 200→150")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_plc_ov");
		const variantId = uniqueTestId("cv2_var_plc_ov_eu");
		const childId = uniqueTestId("cv2_var_plc_ov_seat");
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
				const preview = parsePlanPreview(
					await autumnV2_3.catalogV2.previewUpdate({
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
								licenseChanges: [
									{
										action: "updated",
										license_plan_id: childId,
										plan_change: {
											customize: messagesOverride(150),
										},
									},
								],
							},
						],
					},
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants preview: pin license edit has no license_changes")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_plc_pin");
		const variantId = uniqueTestId("cv2_var_plc_pin_eu");
		const childId = uniqueTestId("cv2_var_plc_pin_seat");
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
				const preview = parsePlanPreview(
					await autumnV2_3.catalogV2.previewUpdate({
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
								variantAction: "unchanged",
								hasPlanChange: false,
								licenseChanges: null,
							},
						],
					},
				});
			},
		});
	},
);
