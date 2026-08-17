/**
 * catalogV2.update — base license DIFF onto a following variant.
 *
 * Contract:
 *   upsert_licenses, not a copy of the base licenses[]
 *   keep drifted customize; apply item-level DIFF
 *   omit from propagate.variants → license frozen
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
	wordsItem,
} from "../../licenses/utils/seedLicensePlans.js";
import { seedBaseVariantWithChildLicense } from "../utils/seedVariantPlans.js";

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: propagated license DIFF keeps 200 and adds Dashboard")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_lic_dash");
		const variantId = uniqueTestId("cv2_var_lic_dash_eu");
		const childId = uniqueTestId("cv2_var_lic_dash_seat");
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
							propagate: { variants: [{ plan_id: variantId }] },
						},
					],
				});
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: variantId,
					licensePlanId: childId,
					customized: true,
					messagesAllowance: 200,
					entitlements: [{ feature_id: TestFeature.Dashboard }],
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: propagated new license link is added on the variant")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_lic_add");
		const variantId = uniqueTestId("cv2_var_lic_add_eu");
		const childId = uniqueTestId("cv2_var_lic_add_seat");
		const extraId = uniqueTestId("cv2_var_lic_add_words");
		await withCatalogPlans({
			ctx,
			planIds: [baseId, variantId, childId, extraId],
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
							plan_id: extraId,
							name: "Words",
							items: [wordsItem(50)],
						},
					],
				});
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: baseId,
							licenses: [
								{
									license_plan_id: childId,
									included: 2,
									customize: messagesOverride(100),
								},
								{ license_plan_id: extraId, included: 1 },
							],
							propagate: { variants: [{ plan_id: variantId }] },
						},
					],
				});
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: variantId,
					licensePlanId: childId,
					messagesAllowance: 200,
				});
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: variantId,
					licensePlanId: extraId,
					included: 1,
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: pin omits license DIFF; variant link stays 200")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_lic_pin");
		const variantId = uniqueTestId("cv2_var_lic_pin_eu");
		const childId = uniqueTestId("cv2_var_lic_pin_seat");
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
						},
					],
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
	`${chalk.yellowBright("catalogV2 variants: propagated overlapping license slot 100→150 overwrites 200")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_lic_ov");
		const variantId = uniqueTestId("cv2_var_lic_ov_eu");
		const childId = uniqueTestId("cv2_var_lic_ov_seat");
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
									customize: messagesOverride(150),
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
					messagesAllowance: 150,
				});
			},
		});
	},
);
