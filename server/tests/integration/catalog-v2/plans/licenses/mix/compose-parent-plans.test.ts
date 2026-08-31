/**
 * catalogV2.update — Team in plans[] (declared content) × child propagate.
 *
 * Team existing + child all_versions → latest is Team's content row; historical follows links-only.
 * Team all_versions + child all_versions → every version is Team's sibling write and follows.
 * Team new_version + child existing → one mint, that mint follows, old frozen.
 */
import { expect, test } from "bun:test";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import {
	expectLatestPlanVersion,
	expectLicenseLinkCorrect,
} from "../utils/expectLicenseLinkCorrect.js";
import {
	bumpChild,
	getFullPlan,
	seedTwoParentVersions,
	withCatalogPlans,
} from "../utils/seedLicensePlans.js";

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: Team existing + child all_versions follows historical links-only")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_mix_ex_p");
		const childId = uniqueTestId("cv2_lic_mix_ex_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await seedTwoParentVersions({
					autumn: autumnV2_3,
					parentId,
					childId,
				});
				await bumpChild({
					autumn: autumnV2_3,
					childId,
					propagate: {
						license_parents: [
							{ plan_id: parentId, version: 1 },
							{ plan_id: parentId, version: 2 },
						],
					},
					parentPlans: [{ plan_id: parentId, name: "Renamed" }],
				});

				const latest = await getFullPlan({ ctx, planId: parentId, version: 2 });
				const historical = await getFullPlan({
					ctx,
					planId: parentId,
					version: 1,
				});
				expect(latest.name).toBe("Renamed");
				expect(historical.name).toBe("Parent");
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					parentVersion: 2,
					licensePlanId: childId,
					customized: false,
					messagesAllowance: 200,
				});
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					parentVersion: 1,
					licensePlanId: childId,
					customized: false,
					messagesAllowance: 200,
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: Team all_versions + child all_versions is declared on every version")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_mix_av_p");
		const childId = uniqueTestId("cv2_lic_mix_av_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await seedTwoParentVersions({
					autumn: autumnV2_3,
					parentId,
					childId,
				});
				await bumpChild({
					autumn: autumnV2_3,
					childId,
					propagate: {
						license_parents: [
							{ plan_id: parentId, version: 1 },
							{ plan_id: parentId, version: 2 },
						],
					},
					parentPlans: [
						{
							plan_id: parentId,
							name: "Renamed",
							versioning: "all_versions",
						},
					],
				});

				const v1 = await getFullPlan({ ctx, planId: parentId, version: 1 });
				const v2 = await getFullPlan({ ctx, planId: parentId, version: 2 });
				expect(v1.name).toBe("Renamed");
				expect(v2.name).toBe("Renamed");
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					parentVersion: 1,
					licensePlanId: childId,
					customized: false,
					messagesAllowance: 200,
				});
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					parentVersion: 2,
					licensePlanId: childId,
					customized: false,
					messagesAllowance: 200,
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: Team new_version + child existing follows the mint")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_mix_nv_p");
		const childId = uniqueTestId("cv2_lic_mix_nv_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await seedTwoParentVersions({
					autumn: autumnV2_3,
					parentId,
					childId,
				});
				await bumpChild({
					autumn: autumnV2_3,
					childId,
					propagate: {
						license_parents: [{ plan_id: parentId, version: 2 }],
					},
					parentPlans: [
						{
							plan_id: parentId,
							name: "Renamed",
							versioning: "new_version", active: true,
						},
					],
				});

				const minted = await expectLatestPlanVersion({
					ctx,
					planId: parentId,
					version: 3,
				});
				expect(minted.name).toBe("Renamed");
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					parentVersion: 3,
					licensePlanId: childId,
					customized: true,
					messagesAllowance: 10,
				});
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					parentVersion: 2,
					licensePlanId: childId,
					customized: false,
					messagesAllowance: 200,
				});
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					parentVersion: 1,
					licensePlanId: childId,
					customized: true,
					messagesAllowance: 10,
				});
			},
		});
	},
);
