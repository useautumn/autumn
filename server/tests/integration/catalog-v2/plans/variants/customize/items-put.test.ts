/**
 * catalogV2.update — variants[].customize.items is PUT-style (replace all items).
 *
 * Contract:
 *   create PUT lists only the desired items (unlisted base items are dropped)
 *   create PUT keeps extras that are listed
 *   edit PUT, no propagate → replaces the variant; base stays put
 *   follow then PUT → the PUT list is the final item set (followed extras
 *     survive only if they are in the list)
 *   items + add_items / remove_items → 400
 *
 * Red (current): customize.items is dropped, so PUT create/edit keeps the clone
 *   / current items (Dashboard still present when not listed).
 * Green (after): variant entitlements match the PUT list exactly.
 */

import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import { deleteDbPlans } from "../../utils/expectCatalogPlans.js";
import {
	dashboardItem,
	messagesItem,
} from "../../licenses/utils/seedLicensePlans.js";
import { expectVariantPlanCorrect } from "../utils/expectVariantPointer.js";
import { seedBaseWithVariant } from "../utils/seedVariantPlans.js";

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: PUT items on create replaces the clone")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const dropBaseId = uniqueTestId("cv2_var_put_c_drop_b");
		const dropVariantId = uniqueTestId("cv2_var_put_c_drop_v");
		const keepBaseId = uniqueTestId("cv2_var_put_c_keep_b");
		const keepVariantId = uniqueTestId("cv2_var_put_c_keep_v");
		await deleteDbPlans({
			ctx,
			planIds: [dropBaseId, dropVariantId, keepBaseId, keepVariantId],
		});
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: dropBaseId,
						name: "Team",
						items: [messagesItem(100), dashboardItem()],
						variants: [
							{
								variant_plan_id: dropVariantId,
								name: "Team EU",
								customize: { items: [messagesItem(300)] },
							},
						],
					},
				],
			});
			await expectVariantPlanCorrect({
				ctx,
				variantPlanId: dropVariantId,
				allowances: { [TestFeature.Messages]: 300 },
				featureIds: [TestFeature.Messages],
			});

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: keepBaseId,
						name: "Team",
						items: [messagesItem(100), dashboardItem()],
						variants: [
							{
								variant_plan_id: keepVariantId,
								name: "Team EU",
								customize: {
									items: [messagesItem(300), dashboardItem()],
								},
							},
						],
					},
				],
			});
			await expectVariantPlanCorrect({
				ctx,
				variantPlanId: keepVariantId,
				allowances: { [TestFeature.Messages]: 300 },
				featureIds: [TestFeature.Messages, TestFeature.Dashboard],
			});
		} finally {
			await deleteDbPlans({
				ctx,
				planIds: [dropBaseId, dropVariantId, keepBaseId, keepVariantId],
			});
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: PUT items on edit replaces, base unchanged")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_put_ed_b");
		const variantId = uniqueTestId("cv2_var_put_ed_v");
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
						variants: [
							{
								variant_plan_id: variantId,
								customize: { items: [messagesItem(300)] },
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
			await expectVariantPlanCorrect({
				ctx,
				variantPlanId: baseId,
				allowances: { [TestFeature.Messages]: 100 },
				featureIds: [TestFeature.Messages],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: follow then PUT items is the final set")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const dropBaseId = uniqueTestId("cv2_var_put_fol_drop_b");
		const dropVariantId = uniqueTestId("cv2_var_put_fol_drop_v");
		const keepBaseId = uniqueTestId("cv2_var_put_fol_keep_b");
		const keepVariantId = uniqueTestId("cv2_var_put_fol_keep_v");
		await deleteDbPlans({
			ctx,
			planIds: [dropBaseId, dropVariantId, keepBaseId, keepVariantId],
		});
		try {
			await seedBaseWithVariant({
				autumn: autumnV2_3,
				baseId: dropBaseId,
				variantId: dropVariantId,
			});
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: dropBaseId,
						items: [messagesItem(100), dashboardItem()],
						variants: [
							{
								variant_plan_id: dropVariantId,
								customize: { items: [messagesItem(300)] },
							},
						],
						propagate: { variants: [{ plan_id: dropVariantId }] },
					},
				],
			});
			await expectVariantPlanCorrect({
				ctx,
				variantPlanId: dropVariantId,
				allowances: { [TestFeature.Messages]: 300 },
				featureIds: [TestFeature.Messages],
			});

			await seedBaseWithVariant({
				autumn: autumnV2_3,
				baseId: keepBaseId,
				variantId: keepVariantId,
			});
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: keepBaseId,
						items: [messagesItem(100), dashboardItem()],
						variants: [
							{
								variant_plan_id: keepVariantId,
								customize: {
									items: [messagesItem(300), dashboardItem()],
								},
							},
						],
						propagate: { variants: [{ plan_id: keepVariantId }] },
					},
				],
			});
			await expectVariantPlanCorrect({
				ctx,
				variantPlanId: keepVariantId,
				allowances: { [TestFeature.Messages]: 300 },
				featureIds: [TestFeature.Messages, TestFeature.Dashboard],
			});
		} finally {
			await deleteDbPlans({
				ctx,
				planIds: [dropBaseId, dropVariantId, keepBaseId, keepVariantId],
			});
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: PUT items cannot mix with PATCH add/remove")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_put_mix_b");
		const variantId = uniqueTestId("cv2_var_put_mix_v");
		await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		try {
			await seedBaseWithVariant({
				autumn: autumnV2_3,
				baseId,
				variantId,
			});
			await expectAutumnError({
				errMessage: "customize.items (PUT-style) cannot be combined",
				func: () =>
					autumnV2_3.catalogV2.update({
						plans: [
							{
								plan_id: baseId,
								variants: [
									{
										variant_plan_id: variantId,
										customize: {
											items: [messagesItem(300)],
											add_items: [dashboardItem()],
										},
									},
								],
							},
						],
					}),
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		}
	},
);
