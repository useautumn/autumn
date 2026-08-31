/**
 * catalogV2.update — versioning × license planners.
 * Parent all_versions is not auto-adopt. propagate new_version must not
 * mint a plan that is not a license parent.
 */
import { expect, test } from "bun:test";
import { ErrCode } from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import { seedVersionableCustomer } from "../../migrations/utils/seedVersionableCustomer.js";
import {
	expectLatestPlanVersion,
	expectLicenseLinkCorrect,
} from "../utils/expectLicenseLinkCorrect.js";
import {
	bumpChild,
	getFullPlan,
	messagesItem,
	messagesOverride,
	seedLinkedChildParent,
	seedTwoParentVersions,
	withCatalogPlans,
} from "../utils/seedLicensePlans.js";

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: parent all_versions without propagate pins every sibling")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_vpall_p");
		const childId = uniqueTestId("cv2_lic_vpall_c");
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
					parentPlans: [
						{ plan_id: parentId, name: "Renamed", versioning: "all_versions" },
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
					customized: true,
					messagesAllowance: 10,
				});
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					parentVersion: 2,
					licensePlanId: childId,
					customized: true,
					messagesAllowance: 10,
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: all_versions + licenses[] overwrites every sibling overlay")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_vdall_p");
		const childId = uniqueTestId("cv2_lic_vdall_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await seedTwoParentVersions({
					autumn: autumnV2_3,
					parentId,
					childId,
				});
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: parentId,
							version: 1,
							licenses: [
								{
									license_plan_id: childId,
									included: 2,
									customize: messagesOverride(500),
								},
							],
						},
					],
				});
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: parentId,
							versioning: "all_versions",
							licenses: [
								{
									license_plan_id: childId,
									included: 2,
									customize: messagesOverride(300),
								},
							],
						},
					],
				});

				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					parentVersion: 1,
					licensePlanId: childId,
					customized: true,
					messagesAllowance: 300,
				});
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					parentVersion: 2,
					licensePlanId: childId,
					customized: true,
					messagesAllowance: 300,
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: all_versions licenses[] still wins with a child item change")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_vdac_p");
		const childId = uniqueTestId("cv2_lic_vdac_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await seedTwoParentVersions({
					autumn: autumnV2_3,
					parentId,
					childId,
				});
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: childId,
							items: [messagesItem(200)],
							propagate: {
								license_parents: [
									{ plan_id: parentId, version: 1 },
									{ plan_id: parentId, version: 2 },
								],
							},
						},
						{
							plan_id: parentId,
							versioning: "all_versions",
							licenses: [
								{
									license_plan_id: childId,
									included: 2,
									customize: messagesOverride(300),
								},
							],
						},
					],
				});

				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					parentVersion: 1,
					licensePlanId: childId,
					customized: true,
					messagesAllowance: 300,
				});
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					parentVersion: 2,
					licensePlanId: childId,
					customized: true,
					messagesAllowance: 300,
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: child + parent new_version renames active in place without customers")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_vnvd_p");
		const childId = uniqueTestId("cv2_lic_vnvd_c");
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
							versioning: "new_version",
						},
					],
				});

				await expectLatestPlanVersion({
					ctx,
					planId: parentId,
					version: 2,
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

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: propagate new_version + parent name-only does not double-write")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_vnvn_p");
		const childId = uniqueTestId("cv2_lic_vnvn_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await seedTwoParentVersions({
					autumn: autumnV2_3,
					parentId,
					childId,
				});
				await seedVersionableCustomer({
					ctx,
					planId: parentId,
					version: 2,
				});
				await bumpChild({
					autumn: autumnV2_3,
					childId,
					propagate: {
						license_parents: [{ plan_id: parentId, version: 2 }],
					},
					parentPlans: [{ plan_id: parentId, name: "Renamed" }],
				});

				const latest = await getFullPlan({ ctx, planId: parentId });
				expect(latest.version).toBeLessThanOrEqual(3);
				const renamed = await getFullPlan({
					ctx,
					planId: parentId,
					version: 2,
				});
				expect(renamed.name).toBe("Renamed");
				if (latest.version === 3) {
					await expectLicenseLinkCorrect({
						ctx,
						parentPlanId: parentId,
						parentVersion: 3,
						licensePlanId: childId,
						customized: false,
						messagesAllowance: 200,
					});
					await expectLicenseLinkCorrect({
						ctx,
						parentPlanId: parentId,
						parentVersion: 2,
						licensePlanId: childId,
						customized: true,
						messagesAllowance: 10,
					});
				}
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: propagate new_version on a non-parent must not mint")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_vspu_p");
		const childId = uniqueTestId("cv2_lic_vspu_c");
		const otherId = uniqueTestId("cv2_lic_vspu_o");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId, otherId],
			run: async () => {
				await seedLinkedChildParent({
					autumn: autumnV2_3,
					parentId,
					childId,
				});
				await autumnV2_3.catalogV2.update({
					plans: [{ plan_id: otherId, name: "Other" }],
				});
				await seedVersionableCustomer({ ctx, planId: otherId });

				await expectAutumnError({
					errCode: ErrCode.InvalidPropagationTarget,
					errMessage: "is not linked to an edited row",
					func: () =>
						bumpChild({
							autumn: autumnV2_3,
							childId,
							propagate: {
								license_parents: [{ plan_id: otherId, version: 1 }],
							},
						}),
				});

				await expectLatestPlanVersion({
					ctx,
					planId: otherId,
					version: 1,
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: child all_versions pins only the linked child version")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_vcav_p");
		const childId = uniqueTestId("cv2_lic_vcav_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await seedLinkedChildParent({
					autumn: autumnV2_3,
					parentId,
					childId,
				});
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: childId,
							versioning: "all_versions",
							items: [messagesItem(200)],
						},
					],
				});

				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					licensePlanId: childId,
					customized: true,
					messagesAllowance: 10,
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: parent new_version without licenses[] clones links onto the mint")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_vmc_p");
		const childId = uniqueTestId("cv2_lic_vmc_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await seedLinkedChildParent({
					autumn: autumnV2_3,
					parentId,
					childId,
				});
				await seedVersionableCustomer({ ctx, planId: parentId });
				await autumnV2_3.catalogV2.update({
					plans: [{ plan_id: parentId, versioning: "new_version" }],
				});

				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					parentVersion: 1,
					licensePlanId: childId,
					customized: false,
					messagesAllowance: 10,
				});
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					parentVersion: 2,
					licensePlanId: childId,
					customized: false,
					messagesAllowance: 10,
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: child v2 pin of a parent still linked to v1 → 400")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_vclaim_p");
		const childId = uniqueTestId("cv2_lic_vclaim_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await seedLinkedChildParent({ autumn: autumnV2_3, parentId, childId });
				await bumpChild({
					autumn: autumnV2_3,
					childId,
					items: [messagesItem(50)],
					versioning: "new_version",
				});
				await seedVersionableCustomer({ ctx, planId: parentId });

				await expectAutumnError({
					errCode: ErrCode.InvalidPropagationTarget,
					errMessage: "is not linked to an edited row",
					func: () =>
						autumnV2_3.catalogV2.update({
							plans: [
								{
									plan_id: childId,
									version: 2,
									items: [messagesItem(200)],
									propagate: {
										license_parents: [{ plan_id: parentId, version: 1 }],
									},
								},
							],
						}),
				});
			},
		});
	},
);
