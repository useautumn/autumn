/**
 * catalogV2.update — variant propagate / pin.
 *
 * Contract:
 *   omit from propagate → frozen (keep drift, no new base items)
 *   propagate.variants → apply base diff, keep untouched slots
 *   overlapping slot → applyDiff overwrites (200 → 150)
 */

import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { expectCatalogResultsCorrect } from "../../../utils/expectCatalogUpdate.js";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import { deleteDbPlans } from "../../utils/expectCatalogPlans.js";
import { dashboardItem, messagesItem } from "../../licenses/utils/seedLicensePlans.js";
import { expectVariantPlanCorrect } from "../utils/expectVariantPointer.js";
import { seedBaseWithVariant } from "../utils/seedVariantPlans.js";

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: propagated items keep 200 and add Dashboard")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_fol_dash");
		const variantId = uniqueTestId("cv2_var_fol_dash_eu");
		await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		try {
			await seedBaseWithVariant({
				autumn: autumnV2_3,
				baseId,
				variantId,
			});
			const response = await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: baseId,
						items: [messagesItem(100), dashboardItem()],
						propagate: { variants: [{ plan_id: variantId, version: 1 }] },
					},
				],
			});
			expectCatalogResultsCorrect({
				response,
				plans: [
					{ id: baseId, action: "update" },
					{ id: variantId, action: "update" },
				],
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
	`${chalk.yellowBright("catalogV2 variants: pin (omit propagate.variants) keeps 200, no Dashboard")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_pin");
		const variantId = uniqueTestId("cv2_var_pin_eu");
		await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		try {
			await seedBaseWithVariant({
				autumn: autumnV2_3,
				baseId,
				variantId,
			});
			const response = await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: baseId,
						items: [messagesItem(100), dashboardItem()],
					},
				],
			});
			expectCatalogResultsCorrect({
				response,
				plans: [{ id: baseId, action: "update" }],
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
	`${chalk.yellowBright("catalogV2 variants: propagated overlapping messages 100→150 overwrites 200")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_fol_ov");
		const variantId = uniqueTestId("cv2_var_fol_ov_eu");
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
						items: [messagesItem(150)],
						propagate: { variants: [{ plan_id: variantId, version: 1 }] },
					},
				],
			});
			await expectVariantPlanCorrect({
				ctx,
				variantPlanId: variantId,
				allowances: { [TestFeature.Messages]: 150 },
				featureIds: [TestFeature.Messages],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		}
	},
);
