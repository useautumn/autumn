/**
 * catalogV2.update — child promote leaves non-propagated links untouched.
 *
 * Contract:
 *   Parent NOT in propagate → link stays version-anchored to child v1:
 *   no repoint, no manufactured overlay, same plan_license row.
 *   Parent IN propagate → follow the newly active child (new reference).
 *   Already-customized parent → leave (same row, same overlay, no retarget).
 *   Parent promote (licenses omitted) → child identity unchanged;
 *   new_version clones outgoing links onto v2; v1 keeps the existing links.
 *   Declared licenses[] on child promote is exclusive — omit version_slug
 *   keeps the existing v1 anchor; customize still applies on that row.
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
	seedTwoParents,
	withCatalogPlans,
} from "../utils/seedLicensePlans.js";
import { expectVersionIdentityCorrect } from "../../utils/expectVersionIdentity.js";

const mintChildDraftV2 = async ({
	autumn,
	childId,
}: {
	autumn: Parameters<typeof seedLinkedChildParent>[0]["autumn"];
	childId: string;
}) => {
	await autumn.catalogV2.update({
		plans: [{ plan_id: childId, versioning: "new_version" }],
	});
};

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: child promote leaves non-propagated link anchored; propagate follows v2")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const frozenId = uniqueTestId("cv2_lic_pr_frz_p");
		const followId = uniqueTestId("cv2_lic_pr_fol_p");
		const childId = uniqueTestId("cv2_lic_pr_mix_c");
		await withCatalogPlans({
			ctx,
			planIds: [frozenId, followId, childId],
			run: async () => {
				await seedTwoParents({
					autumn: autumnV2_3,
					childId,
					parentIds: [frozenId, followId],
				});
				const childV1 = await getFullPlan({ ctx, planId: childId });
				const anchoredBefore = await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: frozenId,
					licensePlanId: childId,
					licenseInternalProductId: childV1.internal_id,
				});
				await mintChildDraftV2({ autumn: autumnV2_3, childId });
				const childV2 = await getFullPlan({
					ctx,
					planId: childId,
					version: 2,
				});

				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: childId,
							version_slug: "v2",
							active: true,
							items: [messagesItem(200)],
							propagate: {
								license_parents: [
									{ plan_id: followId, version: 1 },
								],
							},
						},
					],
				});

				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: frozenId,
					licensePlanId: childId,
					licenseVersion: 1,
					included: 2,
					customized: false,
					messagesAllowance: 10,
					licenseInternalProductId: childV1.internal_id,
					planLicenseId: anchoredBefore.planLicense.id,
				});
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: followId,
					licensePlanId: childId,
					included: 2,
					customized: false,
					messagesAllowance: 200,
					licenseInternalProductId: childV2.internal_id,
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: customized parent is left on child promote")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_pr_cust_p");
		const childId = uniqueTestId("cv2_lic_pr_cust_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await seedLinkedChildParent({
					autumn: autumnV2_3,
					parentId,
					childId,
					customize: messagesOverride(500),
				});
				const childV1 = await getFullPlan({ ctx, planId: childId });
				const before = await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					licensePlanId: childId,
					customized: true,
					messagesAllowance: 500,
					licenseInternalProductId: childV1.internal_id,
				});

				await mintChildDraftV2({ autumn: autumnV2_3, childId });
				await autumnV2_3.catalogV2.update({
					plans: [{ plan_id: childId, version_slug: "v2", active: true }],
				});

				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					licensePlanId: childId,
					licenseVersion: 1,
					customized: true,
					messagesAllowance: 500,
					licenseInternalProductId: childV1.internal_id,
					planLicenseId: before.planLicense.id,
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: parent promote leaves child identity; new_version clones licenses onto v2")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_pr_par_p");
		const childId = uniqueTestId("cv2_lic_pr_par_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await seedLinkedChildParent({
					autumn: autumnV2_3,
					parentId,
					childId,
				});
				const childV1 = await getFullPlan({ ctx, planId: childId });
				await autumnV2_3.catalogV2.update({
					plans: [{ plan_id: parentId, versioning: "new_version" }],
				});

				await autumnV2_3.catalogV2.update({
					plans: [{ plan_id: parentId, version_slug: "v2", active: true }],
				});

				const childAfter = await getFullPlan({ ctx, planId: childId });
				expect(childAfter.version).toBe(1);
				expect(childAfter.internal_id).toBe(childV1.internal_id);

				await expectVersionIdentityCorrect({
					ctx,
					planId: parentId,
					version: 1,
					active: false,
				});
				await expectVersionIdentityCorrect({
					ctx,
					planId: parentId,
					version: 2,
					active: true,
				});
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					parentVersion: 1,
					licensePlanId: childId,
					included: 2,
					licenseInternalProductId: childV1.internal_id,
				});
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					parentVersion: 2,
					licensePlanId: childId,
					included: 2,
					licenseInternalProductId: childV1.internal_id,
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: declared licenses[] on child promote omit keeps the v1 anchor")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_pr_dec_p");
		const childId = uniqueTestId("cv2_lic_pr_dec_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await seedLinkedChildParent({
					autumn: autumnV2_3,
					parentId,
					childId,
					customize: messagesOverride(500),
				});
				const childV1 = await getFullPlan({ ctx, planId: childId });
				await mintChildDraftV2({ autumn: autumnV2_3, childId });

				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: childId,
							version_slug: "v2",
							active: true,
							items: [messagesItem(200)],
						},
						{
							plan_id: parentId,
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
					licensePlanId: childId,
					licenseVersion: 1,
					customized: true,
					messagesAllowance: 300,
					licenseInternalProductId: childV1.internal_id,
				});
			},
		});
	},
);
