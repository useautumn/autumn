/**
 * catalogV2 — a child that has minted its own version, offered by two parents
 * that each have v1 + v2. The child mint freezes every parent row at its old
 * value, so a later propagate can only add; it must never silently un-freeze a
 * diverged slot.
 *
 * Contract:
 *   - child `new_version` → all four parent rows re-point to the new child row
 *     and pin their old allowance
 *   - later child edit (messages 200 + Words) with A `all_versions`, B omitted
 *     → A inherits Words on both versions but keeps its pinned 10;
 *       B inherits nothing
 *   - preview of that edit → value_divergence on all four rows, but
 *     license_action splits propagated (A) vs unchanged (B)
 */

import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import {
	expectPlanPreviewRowCorrect,
	parsePlanPreview,
} from "../../preview/utils/expectPlanPreview.js";
import { expectLicenseLinkCorrect } from "../utils/expectLicenseLinkCorrect.js";
import {
	bumpChild,
	type CatalogV2Client,
	getFullPlan,
	messagesItem,
	seedTwoParentsWithTwoVersions,
	withCatalogPlans,
	wordsItem,
} from "../utils/seedLicensePlans.js";

const messagesValueDivergence = {
	reason: "value_divergence" as const,
	feature_name: "Messages",
	item_filter: { feature_id: TestFeature.Messages },
};

/** Two parents at v1+v2 offering the child, then the child mints its own v2. */
const seedChildVersionOverTwoParents = async ({
	autumn,
	childId,
	parentIds,
}: {
	autumn: CatalogV2Client;
	childId: string;
	parentIds: [string, string];
}) => {
	await seedTwoParentsWithTwoVersions({ autumn, childId, parentIds });
	await bumpChild({
		autumn,
		childId,
		items: [messagesItem(50)],
		versioning: "new_version",
	});
};

const expectEveryParentRow = async ({
	ctx,
	parentIds,
	childId,
	expected,
}: {
	ctx: Parameters<typeof expectLicenseLinkCorrect>[0]["ctx"];
	parentIds: string[];
	childId: string;
	expected: Omit<
		Parameters<typeof expectLicenseLinkCorrect>[0],
		"ctx" | "parentPlanId" | "licensePlanId" | "parentVersion"
	>;
}) => {
	for (const parentPlanId of parentIds) {
		for (const parentVersion of [1, 2]) {
			await expectLicenseLinkCorrect({
				ctx,
				parentPlanId,
				parentVersion,
				licensePlanId: childId,
				...expected,
			});
		}
	}
};

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: child new_version freezes every version of every parent")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const childId = uniqueTestId("cv2_lic_cv2p_c");
		const teamId = uniqueTestId("cv2_lic_cv2p_team");
		const orgId = uniqueTestId("cv2_lic_cv2p_org");
		await withCatalogPlans({
			ctx,
			planIds: [childId, teamId, orgId],
			run: async () => {
				await seedChildVersionOverTwoParents({
					autumn: autumnV2_3,
					childId,
					parentIds: [teamId, orgId],
				});

				const childV2 = await getFullPlan({ ctx, planId: childId });
				// Every link re-points at the new child row but keeps the old allowance.
				await expectEveryParentRow({
					ctx,
					parentIds: [teamId, orgId],
					childId,
					expected: {
						customized: true,
						messagesAllowance: 10,
						licenseInternalProductId: childV2.internal_id,
					},
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: all_versions adds a new item to a frozen parent without un-freezing it")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const childId = uniqueTestId("cv2_lic_cv2f_c");
		const followId = uniqueTestId("cv2_lic_cv2f_follow");
		const pinId = uniqueTestId("cv2_lic_cv2f_pin");
		await withCatalogPlans({
			ctx,
			planIds: [childId, followId, pinId],
			run: async () => {
				await seedChildVersionOverTwoParents({
					autumn: autumnV2_3,
					childId,
					parentIds: [followId, pinId],
				});
				await bumpChild({
					autumn: autumnV2_3,
					childId,
					items: [messagesItem(200), wordsItem(50)],
					propagate: {
						license_parents: [
							{ plan_id: followId, versioning: "all_versions" },
						],
					},
				});

				// Followed parent: Words flows in, the diverged messages slot holds.
				for (const parentVersion of [1, 2]) {
					await expectLicenseLinkCorrect({
						ctx,
						parentPlanId: followId,
						parentVersion,
						licensePlanId: childId,
						customized: true,
						entitlements: [
							{ feature_id: TestFeature.Messages, allowance: 10 },
							{ feature_id: TestFeature.Words, allowance: 50 },
						],
					});
				}
				await expectEveryParentRow({
					ctx,
					parentIds: [pinId],
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
	`${chalk.yellowBright("catalogV2 plan-licenses: preview splits license_action across parents while every row diverges")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const childId = uniqueTestId("cv2_lic_cv2p_pc");
		const followId = uniqueTestId("cv2_lic_cv2p_pfollow");
		const pinId = uniqueTestId("cv2_lic_cv2p_ppin");
		await withCatalogPlans({
			ctx,
			planIds: [childId, followId, pinId],
			run: async () => {
				await seedChildVersionOverTwoParents({
					autumn: autumnV2_3,
					childId,
					parentIds: [followId, pinId],
				});

				const preview = parsePlanPreview(
					await autumnV2_3.catalogV2.previewUpdate({
						plans: [
							{
								plan_id: childId,
								items: [messagesItem(200), wordsItem(50)],
								propagate: {
									license_parents: [
										{ plan_id: followId, versioning: "all_versions" },
									],
								},
							},
						],
					}),
				);

				expectPlanPreviewRowCorrect({
					preview,
					expected: {
						planId: childId,
						licenseParents: [
							{
								planId: followId,
								version: 2,
								licenseAction: "propagated",
								conflicts: [messagesValueDivergence],
								siblingVersions: [
									{
										version: 1,
										licenseAction: "propagated",
										conflicts: [messagesValueDivergence],
									},
								],
							},
							{
								planId: pinId,
								version: 2,
								licenseAction: "unchanged",
								conflicts: [messagesValueDivergence],
								siblingVersions: [
									{
										version: 1,
										licenseAction: "unchanged",
										conflicts: [messagesValueDivergence],
									},
								],
							},
						],
					},
				});
			},
		});
	},
);
