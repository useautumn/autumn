/**
 * catalogV2.update — propagate.license_parents versioning guards.
 * Same combinations as plan-entry versioning: strategy + explicit version, and
 * new_version on a missing plan.
 */
import { test } from "bun:test";
import { ErrCode } from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import {
	bumpChild,
	messagesItem,
	seedLinkedChildParent,
	withCatalogPlans,
} from "../utils/seedLicensePlans.js";

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: propagate new_version + explicit version → 400")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_err_nv_p");
		const childId = uniqueTestId("cv2_lic_err_nv_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await seedLinkedChildParent({
					autumn: autumnV2_3,
					parentId,
					childId,
				});
				await expectAutumnError({
					errCode: ErrCode.InvalidRequest,
					errMessage:
						'versioning "new_version" cannot be combined with an explicit version',
					func: () =>
						bumpChild({
							autumn: autumnV2_3,
							childId,
							propagate: {
								license_parents: [
									{
										plan_id: parentId,
										version: 1,
										versioning: "new_version",
									},
								],
							},
						}),
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: propagate all_versions + explicit version → 400")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_err_av_p");
		const childId = uniqueTestId("cv2_lic_err_av_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await seedLinkedChildParent({
					autumn: autumnV2_3,
					parentId,
					childId,
				});
				await expectAutumnError({
					errCode: ErrCode.InvalidRequest,
					errMessage:
						'versioning "all_versions" cannot be combined with an explicit version',
					func: () =>
						bumpChild({
							autumn: autumnV2_3,
							childId,
							propagate: {
								license_parents: [
									{
										plan_id: parentId,
										version: 1,
										versioning: "all_versions",
									},
								],
							},
						}),
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: propagate new_version on missing parent → 400")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const childId = uniqueTestId("cv2_lic_err_miss_c");
		const missingId = uniqueTestId("cv2_lic_err_miss_p");
		await withCatalogPlans({
			ctx,
			planIds: [childId, missingId],
			run: async () => {
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: childId,
							name: "Seat",
							items: [messagesItem(10)],
						},
					],
				});
				await expectAutumnError({
					errCode: ErrCode.InvalidRequest,
					errMessage: 'versioning "new_version" requires an existing plan',
					func: () =>
						bumpChild({
							autumn: autumnV2_3,
							childId,
							propagate: {
								license_parents: [
									{ plan_id: missingId, versioning: "new_version" },
								],
							},
						}),
				});
			},
		});
	},
);
