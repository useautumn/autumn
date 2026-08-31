/**
 * catalogV2.update — variant declare / follow+declare.
 *
 * Contract:
 *   variants[].customize only → overlay on current, no new base items
 *   follow + customize, same slot → customize wins that slot; rest of base diff applies
 *   follow + customize, different slots → both apply
 */

import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import { deleteDbPlans } from "../../utils/expectCatalogPlans.js";
import { dashboardItem, messagesItem } from "../../licenses/utils/seedLicensePlans.js";
import { expectVariantPlanCorrect } from "../utils/expectVariantPointer.js";
import { seedBaseWithVariant } from "../utils/seedVariantPlans.js";

const messagesCustomize = (included: number) => ({
	remove_items: [{ feature_id: TestFeature.Messages }],
	add_items: [messagesItem(included)],
});

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: declared customize 300, pin items, no new base items")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_dec");
		const variantId = uniqueTestId("cv2_var_dec_eu");
		await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		try {
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
						variants: [
							{
								variant_plan_id: variantId,
								customize: messagesCustomize(300),
							},
						],
					},
				],
			});
			await expectVariantPlanCorrect({
				ctx,
				variantPlanId: variantId,
				allowances: { [TestFeature.Messages]: 300 },
				featureIds: [TestFeature.Messages],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: propagated + declared 300 wins messages, Dashboard still lands")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_dec_fol");
		const variantId = uniqueTestId("cv2_var_dec_fol_eu");
		await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		try {
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
						variants: [
							{
								variant_plan_id: variantId,
								customize: messagesCustomize(300),
							},
						],
						propagate: { variants: [{ plan_id: variantId, version: 1 }] },
					},
				],
			});
			await expectVariantPlanCorrect({
				ctx,
				variantPlanId: variantId,
				allowances: { [TestFeature.Messages]: 300 },
				featureIds: [TestFeature.Messages, TestFeature.Dashboard],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: propagated + declared different booleans both apply")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_dec_bool");
		const variantId = uniqueTestId("cv2_var_dec_bool_eu");
		await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		try {
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
						variants: [
							{
								variant_plan_id: variantId,
								customize: {
									add_items: [{ feature_id: TestFeature.AdminRights }],
								},
							},
						],
						propagate: { variants: [{ plan_id: variantId, version: 1 }] },
					},
				],
			});
			await expectVariantPlanCorrect({
				ctx,
				variantPlanId: variantId,
				allowances: { [TestFeature.Messages]: 200 },
				featureIds: [
					TestFeature.Messages,
					TestFeature.Dashboard,
					TestFeature.AdminRights,
				],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		}
	},
);
