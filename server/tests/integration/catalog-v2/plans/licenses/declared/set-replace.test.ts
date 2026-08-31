/**
 * catalogV2.update — declared licenses[] set replace.
 *
 * Contract:
 *   replace child A with child B in one declared set
 *   two licenses; drop one, keep the other
 *   child already has v2; new licenses:[child] create-defaults to active
 */

import { test } from "bun:test";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import {
	expectLatestPlanVersion,
	expectLicenseLinkCorrect,
	expectLicenseLinkMissing,
} from "../utils/expectLicenseLinkCorrect.js";
import { seedChildVersionsThenParent } from "../../migrations/licenses/utils/seedLicenseDraftPlans.js";
import {
	messagesItem,
	seedParentWithTwoChildren,
	withCatalogPlans,
} from "../utils/seedLicensePlans.js";

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: replace child A with child B")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_rep_p");
		const childA = uniqueTestId("cv2_lic_rep_a");
		const childB = uniqueTestId("cv2_lic_rep_b");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childA, childB],
			run: async () => {
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: childA,
							name: "Seat A",
							items: [messagesItem(10)],
						},
						{
							plan_id: childB,
							name: "Seat B",
							items: [messagesItem(20)],
						},
						{
							plan_id: parentId,
							name: "Parent",
							licenses: [{ license_plan_id: childA, included: 2 }],
						},
					],
				});

				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: parentId,
							licenses: [{ license_plan_id: childB, included: 3 }],
						},
					],
				});

				await expectLicenseLinkMissing({
					ctx,
					parentPlanId: parentId,
					licensePlanId: childA,
				});
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					licensePlanId: childB,
					included: 3,
					customized: false,
					messagesAllowance: 20,
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: two licenses; drop one, keep the other")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_drop_p");
		const seatId = uniqueTestId("cv2_lic_drop_s");
		const packId = uniqueTestId("cv2_lic_drop_k");
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
							licenses: [{ license_plan_id: seatId, included: 2 }],
						},
					],
				});

				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					licensePlanId: seatId,
					included: 2,
				});
				await expectLicenseLinkMissing({
					ctx,
					parentPlanId: parentId,
					licensePlanId: packId,
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: new licenses:[child] create-defaults to the latest child version")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_lat_p");
		const childId = uniqueTestId("cv2_lic_lat_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await seedChildVersionsThenParent({
					autumn: autumnV2_3,
					childId,
					parentId,
				});
				const latest = await expectLatestPlanVersion({
					ctx,
					planId: childId,
					version: 2,
				});
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					licensePlanId: childId,
					licenseInternalProductId: latest.internal_id,
					parentProductVersion: 1,
				});
			},
		});
	},
);
