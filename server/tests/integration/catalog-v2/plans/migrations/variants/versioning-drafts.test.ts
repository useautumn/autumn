/**
 * catalogV2.update — variant drafts inherit the parent plans[] versioning.
 *
 * Contract:
 *   existing: latest only; historical customers do not get a variant op
 *   all_versions: pin when one version has customers; collapse when all do
 *   new_version + draft → 400
 */

import { test } from "bun:test";
import { ErrCode } from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import { seedVersionableCustomer } from "../utils/seedVersionableCustomer.js";
import {
	childItemOp,
	dashboardAddCustomize,
	expectLicenseDraftCase,
	orPlanFilter,
	orVersionPinnedFilter,
	versionPinnedFilter,
} from "../licenses/utils/expectLicenseMigrationDrafts.js";
import {
	dashboardItem,
	messagesItem,
	withCatalogPlans,
} from "../../licenses/utils/seedLicensePlans.js";
import {
	seedBaseWithVariant,
	seedVariantNewVersion,
} from "../../variants/utils/seedVariantPlans.js";

const followDashboard = ({
	baseId,
	variantId,
	versioning,
}: {
	baseId: string;
	variantId: string;
	versioning?: "all_versions" | "new_version";
}) => ({
	plan_id: baseId,
	items: [messagesItem(100), dashboardItem()],
	propagate: { variants: [{ plan_id: variantId }] },
	migration: { draft: true as const },
	...(versioning ? { versioning } : {}),
});

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants drafts: existing skips a customered historical variant")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_dr_ex");
		const variantId = uniqueTestId("cv2_var_dr_ex_eu");
		await withCatalogPlans({
			ctx,
			planIds: [baseId, variantId],
			run: async () => {
				await seedBaseWithVariant({
					autumn: autumnV2_3,
					baseId,
					variantId,
				});
				await seedVariantNewVersion({ autumn: autumnV2_3, variantId });
				await seedVersionableCustomer({ ctx, planId: baseId, version: 1 });
				await seedVersionableCustomer({ ctx, planId: variantId, version: 1 });

				const baseFilter = versionPinnedFilter({ planId: baseId });
				await expectLicenseDraftCase({
					autumn: autumnV2_3,
					ctx,
					plans: [followDashboard({ baseId, variantId })],
					responsePlans: [[{ plan_id: baseId, versions: [1] }]],
					expected: [
						{
							planIds: [baseId],
							omitPlanIds: [variantId],
							noBillingChanges: true,
							filter: { customer: { plan: baseFilter } },
							operations: [
								childItemOp({
									planFilter: baseFilter,
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

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants drafts: all_versions pins the one customered variant version")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_dr_all_p");
		const variantId = uniqueTestId("cv2_var_dr_all_p_eu");
		await withCatalogPlans({
			ctx,
			planIds: [baseId, variantId],
			run: async () => {
				await seedBaseWithVariant({
					autumn: autumnV2_3,
					baseId,
					variantId,
				});
				await seedVariantNewVersion({ autumn: autumnV2_3, variantId });
				await seedVersionableCustomer({ ctx, planId: baseId, version: 1 });
				await seedVersionableCustomer({ ctx, planId: variantId, version: 1 });

				const planFilter = orVersionPinnedFilter({
					branches: [{ planId: baseId }, { planId: variantId, version: 1 }],
				});
				await expectLicenseDraftCase({
					autumn: autumnV2_3,
					ctx,
					plans: [
						followDashboard({
							baseId,
							variantId,
							versioning: "all_versions",
						}),
					],
					responsePlans: [
						[
							{ plan_id: baseId, versions: [1] },
							{ plan_id: variantId, versions: [1] },
						],
					],
					expected: [
						{
							planIds: [baseId, variantId],
							noBillingChanges: true,
							filter: { customer: { plan: planFilter } },
							operations: [
								childItemOp({
									planFilter,
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

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants drafts: all_versions collapses when every customered version is targeted")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_dr_all_c");
		const variantId = uniqueTestId("cv2_var_dr_all_c_eu");
		await withCatalogPlans({
			ctx,
			planIds: [baseId, variantId],
			run: async () => {
				await seedBaseWithVariant({
					autumn: autumnV2_3,
					baseId,
					variantId,
				});
				await seedVariantNewVersion({ autumn: autumnV2_3, variantId });
				await seedVersionableCustomer({ ctx, planId: baseId, version: 1 });
				await seedVersionableCustomer({ ctx, planId: variantId, version: 1 });
				await seedVersionableCustomer({ ctx, planId: variantId, version: 2 });

				const planFilter = orPlanFilter({
					branches: [
						{ plan_id: baseId, version: 1 },
						{ plan_id: variantId },
					],
				});
				await expectLicenseDraftCase({
					autumn: autumnV2_3,
					ctx,
					plans: [
						followDashboard({
							baseId,
							variantId,
							versioning: "all_versions",
						}),
					],
					responsePlans: [
						[
							{ plan_id: baseId, versions: [1] },
							{ plan_id: variantId, versions: [1, 2] },
						],
					],
					expected: [
						{
							planIds: [baseId, variantId],
							noBillingChanges: true,
							filter: { customer: { plan: planFilter } },
							operations: [
								childItemOp({
									planFilter,
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

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants drafts: parent new_version + draft → 400")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_dr_nv");
		const variantId = uniqueTestId("cv2_var_dr_nv_eu");
		await withCatalogPlans({
			ctx,
			planIds: [baseId, variantId],
			run: async () => {
				await seedBaseWithVariant({
					autumn: autumnV2_3,
					baseId,
					variantId,
				});
				await seedVersionableCustomer({ ctx, planId: baseId, version: 1 });
				await seedVersionableCustomer({ ctx, planId: variantId, version: 1 });
				await expectAutumnError({
					errCode: ErrCode.InvalidRequest,
					errMessage:
						'versioning "new_version" cannot be combined with migration.draft',
					func: () =>
						autumnV2_3.catalogV2.update({
							plans: [
								followDashboard({
									baseId,
									variantId,
									versioning: "new_version",
								}),
							],
						}),
				});
			},
		});
	},
);
