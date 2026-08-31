/**
 * catalogV2.update — pin and propagate concat on one parent (split by child)
 * or one child (split by parent).
 */
import { test } from "bun:test";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import { expectLicenseLinkCorrect } from "../utils/expectLicenseLinkCorrect.js";
import {
	messagesItem,
	messagesOverride,
	seedLinkedChildParent,
	seedParentWithTwoChildren,
	seedTwoParents,
	withCatalogPlans,
} from "../utils/seedLicensePlans.js";

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: one parent pins Seat and follows Pack")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_m2c_p");
		const seatId = uniqueTestId("cv2_lic_m2c_s");
		const packId = uniqueTestId("cv2_lic_m2c_k");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, seatId, packId],
			run: async () => {
				await seedParentWithTwoChildren({
					autumn: autumnV2_3,
					parentId,
					childIds: [seatId, packId],
				});
				await autumnV2_3.catalogV2.update({
					plans: [
						{ plan_id: seatId, items: [messagesItem(200)] },
						{
							plan_id: packId,
							items: [messagesItem(200)],
							propagate: { license_parents: [{ plan_id: parentId, version: 1 }] },
						},
					],
				});

				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					licensePlanId: seatId,
					customized: true,
					messagesAllowance: 10,
				});
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					licensePlanId: packId,
					customized: false,
					messagesAllowance: 200,
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: one child pins Team and follows Org")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const childId = uniqueTestId("cv2_lic_m2p_c");
		const teamId = uniqueTestId("cv2_lic_m2p_t");
		const orgId = uniqueTestId("cv2_lic_m2p_o");
		await withCatalogPlans({
			ctx,
			planIds: [childId, teamId, orgId],
			run: async () => {
				await seedTwoParents({
					autumn: autumnV2_3,
					childId,
					parentIds: [teamId, orgId],
				});
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: childId,
							items: [messagesItem(200)],
							propagate: { license_parents: [{ plan_id: orgId, version: 1 }] },
						},
					],
				});

				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: teamId,
					licensePlanId: childId,
					customized: true,
					messagesAllowance: 10,
				});
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: orgId,
					licensePlanId: childId,
					customized: false,
					messagesAllowance: 200,
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: customized Seat skips pin while Pack follows")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_m2cc_p");
		const seatId = uniqueTestId("cv2_lic_m2cc_s");
		const packId = uniqueTestId("cv2_lic_m2cc_k");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, seatId, packId],
			run: async () => {
				await seedParentWithTwoChildren({
					autumn: autumnV2_3,
					parentId,
					childIds: [seatId, packId],
				});
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: parentId,
							licenses: [
								{
									license_plan_id: seatId,
									included: 2,
									customize: messagesOverride(500),
								},
								{ license_plan_id: packId, included: 2 },
							],
						},
					],
				});
				await autumnV2_3.catalogV2.update({
					plans: [
						{ plan_id: seatId, items: [messagesItem(200)] },
						{
							plan_id: packId,
							items: [messagesItem(200)],
							propagate: { license_parents: [{ plan_id: parentId, version: 1 }] },
						},
					],
				});

				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					licensePlanId: seatId,
					customized: true,
					messagesAllowance: 500,
				});
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					licensePlanId: packId,
					customized: false,
					messagesAllowance: 200,
				});
			},
		});
	},
);
