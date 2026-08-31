/**
 * catalogV2.update — new_version + propagate mints from the active
 * variant row (same clone source as a direct new_version), or repoints
 * that row in place when it has no customers. License links copy onto
 * the minted version.
 */

import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import { seedVersionableCustomer } from "../../migrations/utils/seedVersionableCustomer.js";
import { expectLicenseLinkCorrect } from "../../licenses/utils/expectLicenseLinkCorrect.js";
import {
	dashboardItem,
	getFullPlan,
	messagesItem,
	withCatalogPlans,
} from "../../licenses/utils/seedLicensePlans.js";
import {
	expectVariantPlanCorrect,
	expectVariantPointerCorrect,
} from "../utils/expectVariantPointer.js";
import { expectPlanVersionsCorrect } from "../../utils/expectCatalogPlans.js";
import {
	seedBaseVariantWithChildLicense,
	seedBaseWithTwoVariants,
	seedBaseWithVariant,
	seedVariantNewVersion,
} from "../utils/seedVariantPlans.js";

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: propagate mint splits customered vs empty")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_anc_mnt");
		const euAId = uniqueTestId("cv2_var_anc_mnt_a");
		const euBId = uniqueTestId("cv2_var_anc_mnt_b");
		await withCatalogPlans({
			ctx,
			planIds: [baseId, euAId, euBId],
			run: async () => {
				await seedBaseWithTwoVariants({
					autumn: autumnV2_3,
					baseId,
					variantIds: [euAId, euBId],
				});
				await seedVersionableCustomer({ ctx, planId: euAId, version: 1 });
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: baseId,
							items: [messagesItem(100), dashboardItem()],
							versioning: "new_version",
							active: true,
							propagate: {
								variants: [{ plan_id: euAId }, { plan_id: euBId }],
							},
						},
					],
				});

				await expectVariantPointerCorrect({
					ctx,
					variantPlanId: euAId,
					variantVersion: 1,
					basePlanId: baseId,
					baseVersion: 1,
				});
				await expectVariantPointerCorrect({
					ctx,
					variantPlanId: euAId,
					variantVersion: 2,
					basePlanId: baseId,
					baseVersion: 2,
				});
				await expectVariantPlanCorrect({
					ctx,
					variantPlanId: euAId,
					version: 1,
					allowances: { [TestFeature.Messages]: 200 },
					featureIds: [TestFeature.Messages],
				});
				await expectVariantPlanCorrect({
					ctx,
					variantPlanId: euAId,
					version: 2,
					allowances: { [TestFeature.Messages]: 200 },
					featureIds: [TestFeature.Messages, TestFeature.Dashboard],
				});
				await expectVariantPointerCorrect({
					ctx,
					variantPlanId: euBId,
					basePlanId: baseId,
					baseVersion: 2,
				});
				await expectVariantPlanCorrect({
					ctx,
					variantPlanId: euBId,
					allowances: { [TestFeature.Messages]: 200 },
					featureIds: [TestFeature.Messages, TestFeature.Dashboard],
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: empty EU v2 (no customers) repoints in place onto minted base v2")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_anc_rp2");
		const variantId = uniqueTestId("cv2_var_anc_rp2_eu");
		await withCatalogPlans({
			ctx,
			planIds: [baseId, variantId],
			run: async () => {
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
							items: [messagesItem(100), dashboardItem()],
							versioning: "new_version",
							active: true,
							propagate: { variants: [{ plan_id: variantId }] },
						},
					],
				});

				await expectPlanVersionsCorrect({
					ctx,
					planId: variantId,
					versions: [1, 2],
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
					baseVersion: 2,
				});
				await expectVariantPlanCorrect({
					ctx,
					variantPlanId: variantId,
					version: 2,
					allowances: { [TestFeature.Messages]: 200 },
					featureIds: [TestFeature.Messages, TestFeature.Dashboard],
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: propagate mint copies license links onto the new version")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_anc_lic");
		const variantId = uniqueTestId("cv2_var_anc_lic_eu");
		const childId = uniqueTestId("cv2_var_anc_lic_c");
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
				const child = await getFullPlan({ ctx, planId: childId });
				await seedVersionableCustomer({ ctx, planId: variantId, version: 1 });

				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: baseId,
							items: [messagesItem(100), dashboardItem()],
							versioning: "new_version",
							active: true,
							propagate: { variants: [{ plan_id: variantId }] },
						},
					],
				});

				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: variantId,
					licensePlanId: childId,
					parentVersion: 1,
					included: 2,
					licenseInternalProductId: child.internal_id,
				});
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: variantId,
					licensePlanId: childId,
					parentVersion: 2,
					included: 2,
					licenseInternalProductId: child.internal_id,
				});
			},
		});
	},
);
