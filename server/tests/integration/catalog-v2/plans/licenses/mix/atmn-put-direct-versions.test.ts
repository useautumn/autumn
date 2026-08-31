/**
 * catalogV2 — atmn PUT of every version as a direct intent.
 *
 * Child v1 (100 Messages) ← Team v1, child v2 (50 + Words) ← Team v2.
 * Adding Dashboard is four pinned rows, not all_versions / propagate.
 *
 * Contract:
 *   B  four directs → each preview row omits sibling_versions
 *   C  child v1+v2 add Dashboard, parents restate the same licenses[] →
 *      all four rows get Dashboard; Words stay v2-only; anchors stay put
 *   E  restating licenses[] without version_slug keeps the current child row
 *   D  identical re-PUT → action none; plan_license row ids unchanged
 *   drafts  customers on all four + draft:true → one draft, collapsed
 *      filters, child add Dashboard + parent upsert_licenses add Dashboard
 */

import { expect, test } from "bun:test";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import { seedVersionableCustomer } from "../../migrations/utils/seedVersionableCustomer.js";
import {
	childItemOp,
	collapsedPlanFilter,
	dashboardAddCustomize,
	expectLicenseDraftCase,
	orPlanFilter,
	parentLicenseOp,
} from "../../migrations/licenses/utils/expectLicenseMigrationDrafts.js";
import {
	expectPlanPreviewRowCorrect,
	parsePlanPreview,
} from "../../preview/utils/expectPlanPreview.js";
import {
	atmnDirectPut,
	expectAnchoredDashboardCompose,
	seedDivergedChildAnchors,
} from "../utils/atmnPutDirectVersions.js";
import { getFullPlan, withCatalogPlans } from "../utils/seedLicensePlans.js";

const expectNoSiblingVersionsOnDirects = ({
	preview,
	childId,
	parentId,
}: {
	preview: ReturnType<typeof parsePlanPreview>;
	childId: string;
	parentId: string;
}) => {
	for (const currentVersion of [1, 2]) {
		expectPlanPreviewRowCorrect({
			preview,
			expected: {
				planId: childId,
				currentVersion,
				siblingVersions: null,
			},
		});
		expectPlanPreviewRowCorrect({
			preview,
			expected: {
				planId: parentId,
				currentVersion,
				siblingVersions: null,
			},
		});
	}
};

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: atmn PUT two versions each → preview omits sibling_versions")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const childId = uniqueTestId("cv2_lic_atmn_sib_c");
		const parentId = uniqueTestId("cv2_lic_atmn_sib_p");
		await withCatalogPlans({
			ctx,
			planIds: [childId, parentId],
			run: async () => {
				await seedDivergedChildAnchors({
					autumn: autumnV2_3,
					childId,
					parentId,
				});

				const preview = parsePlanPreview(
					await autumnV2_3.catalogV2.previewUpdate({
						plans: atmnDirectPut({ childId, parentId }),
					}),
				);

				expect(
					preview.plans.filter((row) => row.plan_id === childId),
				).toHaveLength(2);
				expect(
					preview.plans.filter((row) => row.plan_id === parentId),
				).toHaveLength(2);
				expectNoSiblingVersionsOnDirects({ preview, childId, parentId });
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: atmn PUT adds Dashboard on all four rows and keeps anchors")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const childId = uniqueTestId("cv2_lic_atmn_put_c");
		const parentId = uniqueTestId("cv2_lic_atmn_put_p");
		await withCatalogPlans({
			ctx,
			planIds: [childId, parentId],
			run: async () => {
				await seedDivergedChildAnchors({
					autumn: autumnV2_3,
					childId,
					parentId,
				});
				const childV1 = await getFullPlan({ ctx, planId: childId, version: 1 });
				const childV2 = await getFullPlan({ ctx, planId: childId, version: 2 });

				await autumnV2_3.catalogV2.update({
					plans: atmnDirectPut({ childId, parentId }),
				});

				const { teamV1LicenseId, teamV2LicenseId } =
					await expectAnchoredDashboardCompose({
						ctx,
						childId,
						parentId,
						childV1InternalId: childV1.internal_id,
						childV2InternalId: childV2.internal_id,
					});

				await autumnV2_3.catalogV2.update({
					plans: atmnDirectPut({
						childId,
						parentId,
						includeChildSlugs: false,
					}),
				});
				await expectAnchoredDashboardCompose({
					ctx,
					childId,
					parentId,
					childV1InternalId: childV1.internal_id,
					childV2InternalId: childV2.internal_id,
					teamV1LicenseId,
					teamV2LicenseId,
				});

				const resent = atmnDirectPut({ childId, parentId });
				const preview = parsePlanPreview(
					await autumnV2_3.catalogV2.previewUpdate({ plans: resent }),
				);
				for (const currentVersion of [1, 2]) {
					expectPlanPreviewRowCorrect({
						preview,
						expected: {
							planId: childId,
							currentVersion,
							action: "none",
						},
					});
					expectPlanPreviewRowCorrect({
						preview,
						expected: {
							planId: parentId,
							currentVersion,
							action: "none",
						},
					});
				}

				await autumnV2_3.catalogV2.update({ plans: resent });
				await expectAnchoredDashboardCompose({
					ctx,
					childId,
					parentId,
					childV1InternalId: childV1.internal_id,
					childV2InternalId: childV2.internal_id,
					teamV1LicenseId,
					teamV2LicenseId,
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 license-drafts: atmn PUT of four directs collapses one Dashboard draft")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const childId = uniqueTestId("cv2_lic_atmn_dr_c");
		const parentId = uniqueTestId("cv2_lic_atmn_dr_p");
		await withCatalogPlans({
			ctx,
			planIds: [childId, parentId],
			run: async () => {
				await seedDivergedChildAnchors({
					autumn: autumnV2_3,
					childId,
					parentId,
				});
				await seedVersionableCustomer({ ctx, planId: childId, version: 1 });
				await seedVersionableCustomer({ ctx, planId: childId, version: 2 });
				await seedVersionableCustomer({ ctx, planId: parentId, version: 1 });
				await seedVersionableCustomer({ ctx, planId: parentId, version: 2 });

				const childFilter = collapsedPlanFilter({ planId: childId });
				const parentFilter = collapsedPlanFilter({ planId: parentId });
				await expectLicenseDraftCase({
					autumn: autumnV2_3,
					ctx,
					plans: atmnDirectPut({ childId, parentId, draft: true }),
					preview: true,
					responsePlans: [
						[
							{ plan_id: childId, versions: [1, 2] },
							{ plan_id: parentId, versions: [1, 2] },
						],
					],
					expected: [
						{
							planIds: [childId, parentId],
							noBillingChanges: true,
							filter: {
								customer: {
									plan: orPlanFilter({
										branches: [
											{ plan_id: childId },
											{ plan_id: parentId },
										],
									}),
								},
							},
							operations: [
								childItemOp({
									planFilter: childFilter,
									customize: dashboardAddCustomize,
								}),
								parentLicenseOp({
									planFilter: parentFilter,
									childId,
									customize: dashboardAddCustomize,
								}),
							],
						},
					],
				});
			},
		});
	},
);
