/**
 * catalogV2.update — direct plans[] on a variant beats derived follow.
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

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: direct plans[] wins over variant_propagation")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_dir");
		const variantId = uniqueTestId("cv2_var_dir_eu");
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
						propagate: { variants: [{ plan_id: variantId }] },
					},
					{
						plan_id: variantId,
						items: [
							messagesItem(200),
							{ feature_id: TestFeature.AdminRights },
						],
					},
				],
			});
			await expectVariantPlanCorrect({
				ctx,
				variantPlanId: variantId,
				allowances: { [TestFeature.Messages]: 200 },
				featureIds: [TestFeature.Messages, TestFeature.AdminRights],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		}
	},
);
