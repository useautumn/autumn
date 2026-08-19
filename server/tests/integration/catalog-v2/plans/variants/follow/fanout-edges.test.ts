/**
 * catalogV2.update — follow edges V1 ported: skipped add is gone,
 * concat pin+follow, OOTO-IWTN re-adds a stripped slot.
 */

import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import {
	dashboardItem,
	messagesItem,
	withCatalogPlans,
	wordsItem,
} from "../../licenses/utils/seedLicensePlans.js";
import { expectVariantPlanCorrect } from "../utils/expectVariantPointer.js";
import {
	seedBaseWithTwoVariants,
	seedBaseWithVariant,
} from "../utils/seedVariantPlans.js";

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants follow: skipped Dashboard add is not replayed on later follow")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_skip");
		const variantId = uniqueTestId("cv2_var_skip_eu");
		await withCatalogPlans({
			ctx,
			planIds: [baseId, variantId],
			run: async () => {
				await seedBaseWithVariant({
					autumn: autumnV2_3,
					baseId,
					variantId,
				});
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: baseId,
							items: [messagesItem(100), dashboardItem()],
						},
					],
				});
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: baseId,
							items: [messagesItem(150), dashboardItem()],
							propagate: { variants: [{ plan_id: variantId }] },
						},
					],
				});
				await expectVariantPlanCorrect({
					ctx,
					variantPlanId: variantId,
					allowances: { [TestFeature.Messages]: 150 },
					featureIds: [TestFeature.Messages],
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants follow: concat — follow EU, pin UK")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_concat");
		const euId = uniqueTestId("cv2_var_concat_eu");
		const ukId = uniqueTestId("cv2_var_concat_uk");
		await withCatalogPlans({
			ctx,
			planIds: [baseId, euId, ukId],
			run: async () => {
				await seedBaseWithTwoVariants({
					autumn: autumnV2_3,
					baseId,
					variantIds: [euId, ukId],
				});
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: baseId,
							items: [messagesItem(100), dashboardItem()],
							propagate: { variants: [{ plan_id: euId }] },
						},
					],
				});
				await expectVariantPlanCorrect({
					ctx,
					variantPlanId: euId,
					allowances: { [TestFeature.Messages]: 200 },
					featureIds: [TestFeature.Messages, TestFeature.Dashboard],
				});
				await expectVariantPlanCorrect({
					ctx,
					variantPlanId: ukId,
					allowances: { [TestFeature.Messages]: 200 },
					featureIds: [TestFeature.Messages],
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants follow: OOTO-IWTN re-adds stripped Words at 10")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_ooto");
		const variantId = uniqueTestId("cv2_var_ooto_eu");
		await withCatalogPlans({
			ctx,
			planIds: [baseId, variantId],
			run: async () => {
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: baseId,
							name: "Team",
							items: [messagesItem(100), wordsItem(5)],
							variants: [
								{
									variant_plan_id: variantId,
									name: "Team EU",
									customize: {
										remove_items: [
											{ feature_id: TestFeature.Messages },
											{ feature_id: TestFeature.Words },
										],
										add_items: [messagesItem(200)],
									},
								},
							],
						},
					],
				});
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: baseId,
							items: [messagesItem(100), wordsItem(10)],
							propagate: { variants: [{ plan_id: variantId }] },
						},
					],
				});
				await expectVariantPlanCorrect({
					ctx,
					variantPlanId: variantId,
					allowances: {
						[TestFeature.Messages]: 200,
						[TestFeature.Words]: 10,
					},
					featureIds: [TestFeature.Messages, TestFeature.Words],
				});
			},
		});
	},
);
