/**
 * catalogV2.update — base new_version does not auto-repoint variants.
 *
 * Contract:
 *   no propagate → pointer stays on the mint source; items frozen
 *   propagate + no customers → pointer moves + item DIFF
 *   historical variant version stays on the old base row
 */

import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import { deleteDbPlans } from "../../utils/expectCatalogPlans.js";
import { dashboardItem, messagesItem } from "../../licenses/utils/seedLicensePlans.js";
import {
	expectVariantPlanCorrect,
	expectVariantPointerCorrect,
} from "../utils/expectVariantPointer.js";
import {
	seedBaseWithVariant,
	seedVariantNewVersion,
} from "../utils/seedVariantPlans.js";

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: base new_version without propagate leaves pointer on v1")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_ptr_pin");
		const variantId = uniqueTestId("cv2_var_ptr_pin_eu");
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
						versioning: "new_version",
						active: true,
						items: [messagesItem(100), dashboardItem()],
					},
				],
			});
			await expectVariantPointerCorrect({
				ctx,
				variantPlanId: variantId,
				basePlanId: baseId,
				baseVersion: 1,
			});
			await expectVariantPlanCorrect({
				ctx,
				variantPlanId: variantId,
				allowances: { [TestFeature.Messages]: 200 },
				featureIds: [TestFeature.Messages],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: base new_version + propagate re-points empty-customer latest")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_ptr_prop");
		const variantId = uniqueTestId("cv2_var_ptr_prop_eu");
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
					versioning: "new_version",
					active: true,
					items: [messagesItem(100), dashboardItem()],
					propagate: { variants: [{ plan_id: variantId }] },
					},
				],
			});
			await expectVariantPointerCorrect({
				ctx,
				variantPlanId: variantId,
				basePlanId: baseId,
				baseVersion: 2,
			});
			await expectVariantPlanCorrect({
				ctx,
				variantPlanId: variantId,
				allowances: { [TestFeature.Messages]: 200 },
				featureIds: [TestFeature.Messages, TestFeature.Dashboard],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: base new_version leaves historical variant v1 on the old row")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_ptr_hist");
		const variantId = uniqueTestId("cv2_var_ptr_hist_eu");
		await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		try {
			await seedBaseWithVariant({
				autumn: autumnV2_3,
				baseId,
				variantId,
			});
			await seedVariantNewVersion({ autumn: autumnV2_3, variantId });
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: baseId,
						versioning: "new_version",
						active: true,
						items: [messagesItem(100), dashboardItem()],
					},
				],
			});
			await expectVariantPointerCorrect({
				ctx,
				variantPlanId: variantId,
				variantVersion: 1,
				basePlanId: baseId,
				baseVersion: 1,
			});
			await expectVariantPointerCorrect({
				ctx,
				variantPlanId: variantId,
				variantVersion: 2,
				basePlanId: baseId,
				baseVersion: 1,
			});
			await expectVariantPlanCorrect({
				ctx,
				variantPlanId: variantId,
				version: 1,
				allowances: { [TestFeature.Messages]: 200 },
				featureIds: [TestFeature.Messages],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		}
	},
);
