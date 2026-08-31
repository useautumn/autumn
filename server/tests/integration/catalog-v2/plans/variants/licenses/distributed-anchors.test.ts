/**
 * catalogV2.update — variant license links ride the same derive fold.
 *
 * Contract:
 *   Team updates the child-v1 license + propagate.variants → EU's link
 *   follows that write (same fold, no parallel path); both stay on v1.
 *   Child v2 propagate while both parents still anchor v1 → no row reached.
 */

import { test } from "bun:test";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import { expectLicenseLinkCorrect } from "../../licenses/utils/expectLicenseLinkCorrect.js";
import {
	bumpChild,
	getFullPlan,
	messagesItem,
	withCatalogPlans,
} from "../../licenses/utils/seedLicensePlans.js";
import { seedBaseVariantWithChildLicense } from "../utils/seedVariantPlans.js";

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: parent v1 license write + propagate.variants rides the derive fold")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_anch_b");
		const variantId = uniqueTestId("cv2_var_anch_eu");
		const childId = uniqueTestId("cv2_var_anch_c");
		await withCatalogPlans({
			ctx,
			planIds: [baseId, variantId, childId],
			run: async () => {
				await seedBaseVariantWithChildLicense({
					autumn: autumnV2_3,
					baseId,
					variantId,
					childId,
					customizeLicenses: false,
				});
				await bumpChild({
					autumn: autumnV2_3,
					childId,
					items: [messagesItem(50)],
					versioning: "new_version",
				});
				const childV1 = await getFullPlan({ ctx, planId: childId, version: 1 });

				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: baseId,
							licenses: [
								{
									license_plan_id: childId,
									included: 5,
									version_slug: "v1",
								},
							],
							propagate: { variants: [{ plan_id: variantId }] },
						},
					],
				});

				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: baseId,
					licensePlanId: childId,
					included: 5,
					licenseInternalProductId: childV1.internal_id,
				});
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: variantId,
					licensePlanId: childId,
					included: 5,
					licenseInternalProductId: childV1.internal_id,
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: child v2 propagate leaves variant parents anchored to v1")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_lag_b");
		const variantId = uniqueTestId("cv2_var_lag_eu");
		const childId = uniqueTestId("cv2_var_lag_c");
		await withCatalogPlans({
			ctx,
			planIds: [baseId, variantId, childId],
			run: async () => {
				await seedBaseVariantWithChildLicense({
					autumn: autumnV2_3,
					baseId,
					variantId,
					childId,
					customizeLicenses: false,
				});
				const childV1 = await getFullPlan({ ctx, planId: childId });
				await bumpChild({
					autumn: autumnV2_3,
					childId,
					items: [messagesItem(50)],
					versioning: "new_version",
				});

				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: childId,
							items: [messagesItem(200)],
							propagate: {
								license_parents: [
									{ plan_id: baseId },
									{ plan_id: variantId },
								],
							},
						},
					],
				});

				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: baseId,
					licensePlanId: childId,
					customized: false,
					messagesAllowance: 10,
					licenseInternalProductId: childV1.internal_id,
				});
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: variantId,
					licensePlanId: childId,
					customized: false,
					messagesAllowance: 10,
					licenseInternalProductId: childV1.internal_id,
				});
			},
		});
	},
);
