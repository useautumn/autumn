/**
 * catalogV2.update — two parents, each with v1 + v2, offering the same child.
 * One parent is in the child's propagate, the other is omitted (pinned).
 * Locks that a per-parent strategy stays inside that parent, across versions.
 *
 * Contract:
 *   - A `all_versions`, B omitted
 *     → both A versions follow; both B versions freeze (not just B's latest)
 *   - same + A v1 customized 500, child adds Words
 *     → A v1 rebases (500 + Words), A v2 stock (200 + Words), B frozen with no Words
 *   - A `{ version: 1 }`, B omitted
 *     → only A v1 follows; A v2 freezes; both B versions freeze
 */

import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import { expectLicenseLinkCorrect } from "../utils/expectLicenseLinkCorrect.js";
import {
	bumpChild,
	messagesItem,
	messagesOverride,
	seedTwoParentsWithTwoVersions,
	withCatalogPlans,
	wordsItem,
} from "../utils/seedLicensePlans.js";

/** Both versions of one parent share an expectation. */
const expectBothVersions = async ({
	ctx,
	parentPlanId,
	childId,
	expected,
}: {
	ctx: Parameters<typeof expectLicenseLinkCorrect>[0]["ctx"];
	parentPlanId: string;
	childId: string;
	expected: Omit<
		Parameters<typeof expectLicenseLinkCorrect>[0],
		"ctx" | "parentPlanId" | "licensePlanId" | "parentVersion"
	>;
}) => {
	for (const parentVersion of [1, 2]) {
		await expectLicenseLinkCorrect({
			ctx,
			parentPlanId,
			parentVersion,
			licensePlanId: childId,
			...expected,
		});
	}
};

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: all_versions on one parent leaves the pinned parent frozen on every version")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const childId = uniqueTestId("cv2_lic_2pv_c");
		const followId = uniqueTestId("cv2_lic_2pv_follow");
		const pinId = uniqueTestId("cv2_lic_2pv_pin");
		await withCatalogPlans({
			ctx,
			planIds: [childId, followId, pinId],
			run: async () => {
				await seedTwoParentsWithTwoVersions({
					autumn: autumnV2_3,
					childId,
					parentIds: [followId, pinId],
				});
				await bumpChild({
					autumn: autumnV2_3,
					childId,
					included: 200,
					propagate: {
						license_parents: [
							{ plan_id: followId, version: 1 },
							{ plan_id: followId, version: 2 },
						],
					},
				});

				await expectBothVersions({
					ctx,
					parentPlanId: followId,
					childId,
					expected: { customized: false, messagesAllowance: 200 },
				});
				await expectBothVersions({
					ctx,
					parentPlanId: pinId,
					childId,
					expected: { customized: true, messagesAllowance: 10 },
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: followed parent rebases its customized v1 while the pinned parent inherits nothing")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const childId = uniqueTestId("cv2_lic_2pvo_c");
		const followId = uniqueTestId("cv2_lic_2pvo_follow");
		const pinId = uniqueTestId("cv2_lic_2pvo_pin");
		await withCatalogPlans({
			ctx,
			planIds: [childId, followId, pinId],
			run: async () => {
				await seedTwoParentsWithTwoVersions({
					autumn: autumnV2_3,
					childId,
					parentIds: [followId, pinId],
				});
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: followId,
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
				await bumpChild({
					autumn: autumnV2_3,
					childId,
					items: [messagesItem(200), wordsItem(50)],
					propagate: {
						license_parents: [
							{ plan_id: followId, version: 1 },
							{ plan_id: followId, version: 2 },
						],
					},
				});

				// The override survives; the new child item still flows in.
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: followId,
					parentVersion: 1,
					licensePlanId: childId,
					customized: true,
					entitlements: [
						{ feature_id: TestFeature.Messages, allowance: 500 },
						{ feature_id: TestFeature.Words, allowance: 50 },
					],
				});
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: followId,
					parentVersion: 2,
					licensePlanId: childId,
					customized: false,
					entitlements: [
						{ feature_id: TestFeature.Messages, allowance: 200 },
						{ feature_id: TestFeature.Words, allowance: 50 },
					],
				});
				await expectBothVersions({
					ctx,
					parentPlanId: pinId,
					childId,
					expected: {
						customized: true,
						messagesAllowance: 10,
						omitFeatureIds: [TestFeature.Words],
					},
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: pinned version on a followed parent freezes alongside the pinned parent")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const childId = uniqueTestId("cv2_lic_2pvp_c");
		const followId = uniqueTestId("cv2_lic_2pvp_follow");
		const pinId = uniqueTestId("cv2_lic_2pvp_pin");
		await withCatalogPlans({
			ctx,
			planIds: [childId, followId, pinId],
			run: async () => {
				await seedTwoParentsWithTwoVersions({
					autumn: autumnV2_3,
					childId,
					parentIds: [followId, pinId],
				});
				await bumpChild({
					autumn: autumnV2_3,
					childId,
					included: 200,
					propagate: {
						license_parents: [{ plan_id: followId, version: 1 }],
					},
				});

				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: followId,
					parentVersion: 1,
					licensePlanId: childId,
					customized: false,
					messagesAllowance: 200,
				});
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: followId,
					parentVersion: 2,
					licensePlanId: childId,
					customized: true,
					messagesAllowance: 10,
				});
				await expectBothVersions({
					ctx,
					parentPlanId: pinId,
					childId,
					expected: { customized: true, messagesAllowance: 10 },
				});
			},
		});
	},
);
