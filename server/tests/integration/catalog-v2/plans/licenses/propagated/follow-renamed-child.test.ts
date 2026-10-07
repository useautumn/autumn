/**
 * catalogV2.update — a license child renamed in the same update that propagates
 * to its parent keeps the parent's link and the parent follows the new items.
 */
import { expect, test } from "bun:test";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import { expectLicenseLinkCorrect } from "../utils/expectLicenseLinkCorrect.js";
import {
	getFullPlan,
	messagesItem,
	messagesOverride,
	seedLinkedChildParent,
	withCatalogPlans,
} from "../utils/seedLicensePlans.js";

const linkedLicensePlanIds = async ({
	ctx,
	parentId,
}: {
	ctx: Parameters<typeof getFullPlan>[0]["ctx"];
	parentId: string;
}) =>
	((await getFullPlan({ ctx, planId: parentId })).licenses ?? []).map(
		(link) => link.product.id,
	);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: renamed child in-place edit propagates to its parent")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_ren_p");
		const childId = uniqueTestId("cv2_lic_ren_c");
		const renamedId = `${childId}_new`;
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId, renamedId],
			run: async () => {
				await seedLinkedChildParent({ autumn: autumnV2_3, parentId, childId });
				const child = await getFullPlan({ ctx, planId: childId });

				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: childId,
							new_plan_id: renamedId,
							items: [messagesItem(200)],
							propagate: {
								license_parents: [{ plan_id: parentId, version: 1 }],
							},
						},
					],
				});

				expect(await linkedLicensePlanIds({ ctx, parentId })).toEqual([
					renamedId,
				]);
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					licensePlanId: renamedId,
					included: 2,
					customized: false,
					messagesAllowance: 200,
					licenseInternalProductId: child.internal_id,
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: renamed child new_version re-points its parent")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_ren_mint_p");
		const childId = uniqueTestId("cv2_lic_ren_mint_c");
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
							items: [messagesItem(300)],
							versioning: "new_version",
							active: true,
							propagate: {
								license_parents: [{ plan_id: parentId, version: 1 }],
							},
						},
					],
				});

				const renamedV2 = await getFullPlan({
					ctx,
					planId: renamedId,
					version: 2,
				});
				expect(await linkedLicensePlanIds({ ctx, parentId })).toEqual([
					renamedId,
				]);
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					licensePlanId: renamedId,
					included: 2,
					messagesAllowance: 300,
					licenseInternalProductId: renamedV2.internal_id,
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: renamed child rebases a customized parent link")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_ren_cust_p");
		const childId = uniqueTestId("cv2_lic_ren_cust_c");
		const renamedId = `${childId}_new`;
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId, renamedId],
			run: async () => {
				await seedLinkedChildParent({
					autumn: autumnV2_3,
					parentId,
					childId,
					customize: messagesOverride(50),
				});

				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: childId,
							new_plan_id: renamedId,
							items: [messagesItem(200)],
							versioning: "new_version",
							active: true,
							propagate: {
								license_parents: [{ plan_id: parentId, version: 1 }],
							},
						},
					],
				});

				const renamedV2 = await getFullPlan({
					ctx,
					planId: renamedId,
					version: 2,
				});
				expect(await linkedLicensePlanIds({ ctx, parentId })).toEqual([
					renamedId,
				]);
				const [link] =
					(await getFullPlan({ ctx, planId: parentId })).licenses ?? [];
				expect(link?.license_internal_product_id).toBe(renamedV2.internal_id);
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					licensePlanId: renamedId,
					customized: true,
					messagesAllowance: 50,
				});
			},
		});
	},
);
