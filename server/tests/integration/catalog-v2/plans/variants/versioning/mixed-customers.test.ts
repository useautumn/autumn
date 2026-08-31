/**
 * catalogV2.update — base new_version inherits per variant:
 *   customers on latest → mint
 *   no customers → in-place
 */

import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import { seedVersionableCustomer } from "../../migrations/utils/seedVersionableCustomer.js";
import {
	dashboardItem,
	messagesItem,
	withCatalogPlans,
} from "../../licenses/utils/seedLicensePlans.js";
import {
	expectPlanPreviewRowCorrect,
	parsePlanPreview,
} from "../../preview/utils/expectPlanPreview.js";
import { expectVariantPlanCorrect } from "../utils/expectVariantPointer.js";
import { seedBaseWithTwoVariants } from "../utils/seedVariantPlans.js";

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: new_version mints customered EU, in-place UK")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_mix");
		const euId = uniqueTestId("cv2_var_mix_eu");
		const ukId = uniqueTestId("cv2_var_mix_uk");
		await withCatalogPlans({
			ctx,
			planIds: [baseId, euId, ukId],
			run: async () => {
				await seedBaseWithTwoVariants({
					autumn: autumnV2_3,
					baseId,
					variantIds: [euId, ukId],
				});
				await seedVersionableCustomer({ ctx, planId: euId, version: 1 });
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: baseId,
							items: [messagesItem(100), dashboardItem()],
							versioning: "new_version", active: true,
							propagate: {
								variants: [{ plan_id: euId }, { plan_id: ukId }],
							},
						},
					],
				});
				await expectVariantPlanCorrect({
					ctx,
					variantPlanId: euId,
					version: 1,
					allowances: { [TestFeature.Messages]: 200 },
					featureIds: [TestFeature.Messages],
				});
				await expectVariantPlanCorrect({
					ctx,
					variantPlanId: euId,
					version: 2,
					allowances: { [TestFeature.Messages]: 200 },
					featureIds: [TestFeature.Messages, TestFeature.Dashboard],
				});
				await expectVariantPlanCorrect({
					ctx,
					variantPlanId: ukId,
					version: 1,
					allowances: { [TestFeature.Messages]: 200 },
					featureIds: [TestFeature.Messages, TestFeature.Dashboard],
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants preview: new_version mint nest is version 2")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_mix_prv");
		const euId = uniqueTestId("cv2_var_mix_prv_eu");
		const ukId = uniqueTestId("cv2_var_mix_prv_uk");
		await withCatalogPlans({
			ctx,
			planIds: [baseId, euId, ukId],
			run: async () => {
				await seedBaseWithTwoVariants({
					autumn: autumnV2_3,
					baseId,
					variantIds: [euId, ukId],
				});
				await seedVersionableCustomer({ ctx, planId: euId, version: 1 });
				const preview = parsePlanPreview(
					await autumnV2_3.catalogV2.previewUpdate({
						plans: [
							{
								plan_id: baseId,
								items: [messagesItem(100), dashboardItem()],
								versioning: "new_version", active: true,
								propagate: {
									variants: [{ plan_id: euId }, { plan_id: ukId }],
								},
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
								planId: euId,
								version: 2,
								variantAction: "unchanged",
							},
							{
								planId: ukId,
								version: 1,
								variantAction: "propagated",
								hasPlanChange: true,
							},
						],
					},
				});
			},
		});
	},
);
