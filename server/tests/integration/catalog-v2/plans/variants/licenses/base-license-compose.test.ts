/**
 * catalogV2.update — license follow compose with plan items and declare.
 *
 * Contract:
 *   omit licenses[] → variant Seat link untouched
 *   follow + variants[].customize.upsert_licenses 300 → 300 wins slot, Dashboard still lands
 *   items-only Team follow does not add Dashboard onto the Seat overlay
 */

import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import { expectLicenseLinkCorrect } from "../../licenses/utils/expectLicenseLinkCorrect.js";
import {
	dashboardItem,
	messagesItem,
	messagesOverride,
	withCatalogPlans,
} from "../../licenses/utils/seedLicensePlans.js";
import { expectVariantPlanCorrect } from "../utils/expectVariantPointer.js";
import { seedBaseVariantWithChildLicense } from "../utils/seedVariantPlans.js";

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants licenses: items-only follow leaves Seat overlay at 200")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_lic_items");
		const variantId = uniqueTestId("cv2_var_lic_items_eu");
		const childId = uniqueTestId("cv2_var_lic_items_seat");
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
				await autumnV2_3.catalogV2.update({
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
					featureIds: [TestFeature.Messages, TestFeature.Dashboard],
				});
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: variantId,
					licensePlanId: childId,
					messagesAllowance: 200,
					omitFeatureIds: [TestFeature.Dashboard],
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants licenses: follow + declare upsert_licenses 300 wins messages, Dashboard lands")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_lic_decl");
		const variantId = uniqueTestId("cv2_var_lic_decl_eu");
		const childId = uniqueTestId("cv2_var_lic_decl_seat");
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
				await autumnV2_3.catalogV2.update({
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
							variants: [
								{
									variant_plan_id: variantId,
									customize: {
										upsert_licenses: [
											{
												license_plan_id: childId,
												customize: messagesOverride(300),
											},
										],
									},
								},
							],
							propagate: { variants: [{ plan_id: variantId }] },
						},
					],
				});
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: variantId,
					licensePlanId: childId,
					messagesAllowance: 300,
					entitlements: [{ feature_id: TestFeature.Dashboard }],
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants licenses: declare-only upsert_licenses 300 does not take Dashboard")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_lic_declonly");
		const variantId = uniqueTestId("cv2_var_lic_declonly_eu");
		const childId = uniqueTestId("cv2_var_lic_declonly_seat");
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
				await autumnV2_3.catalogV2.update({
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
							variants: [
								{
									variant_plan_id: variantId,
									customize: {
										upsert_licenses: [
											{
												license_plan_id: childId,
												customize: messagesOverride(300),
											},
										],
									},
								},
							],
						},
					],
				});
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: variantId,
					licensePlanId: childId,
					messagesAllowance: 300,
					omitFeatureIds: [TestFeature.Dashboard],
				});
			},
		});
	},
);
