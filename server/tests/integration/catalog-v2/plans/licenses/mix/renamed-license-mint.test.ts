/**
 * catalogV2.update — a license child renamed in the same batch that mints its
 * parent, or renamed from one of several versions, keeps exactly one link.
 */
import { expect, test } from "bun:test";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import { expectLicenseLinkCorrect } from "../utils/expectLicenseLinkCorrect.js";
import {
	getFullPlan,
	messagesItem,
	seedLinkedChildParent,
	withCatalogPlans,
} from "../utils/seedLicensePlans.js";

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: parent mint + renamed child edit plans one link")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_ren_pm_p");
		const childId = uniqueTestId("cv2_lic_ren_pm_c");
		const renamedId = `${childId}_new`;
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId, renamedId],
			run: async () => {
				await seedLinkedChildParent({ autumn: autumnV2_3, parentId, childId });

				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: childId,
							new_plan_id: renamedId,
							items: [messagesItem(200)],
						},
						{
							plan_id: parentId,
							name: "Parent v2",
							versioning: "new_version",
							active: true,
						},
					],
				});

				const parentV2 = await getFullPlan({
					ctx,
					planId: parentId,
					version: 2,
				});
				expect(parentV2.licenses?.map((link) => link.product.id)).toEqual([
					renamedId,
				]);
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					parentVersion: 2,
					licensePlanId: renamedId,
					included: 2,
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: renaming one license version keeps a link anchored to its sibling")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_ren_sib_p");
		const childId = uniqueTestId("cv2_lic_ren_sib_c");
		const renamedId = `${childId}_new`;
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId, renamedId],
			run: async () => {
				await seedLinkedChildParent({ autumn: autumnV2_3, parentId, childId });
				const childV1 = await getFullPlan({ ctx, planId: childId });
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: childId,
							items: [messagesItem(300)],
							versioning: "new_version",
							active: true,
						},
					],
				});

				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: childId,
							version: 2,
							new_plan_id: renamedId,
							items: [messagesItem(300)],
						},
						{
							plan_id: parentId,
							name: "Parent",
							licenses: [
								{ license_plan_id: renamedId, version_slug: "v1", included: 2 },
							],
						},
					],
				});

				const parent = await getFullPlan({ ctx, planId: parentId });
				expect(parent.licenses?.map((link) => link.product.id)).toEqual([
					renamedId,
				]);
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					licensePlanId: renamedId,
					included: 2,
					licenseVersion: 1,
					licenseInternalProductId: childV1.internal_id,
					messagesAllowance: 10,
				});
			},
		});
	},
);
