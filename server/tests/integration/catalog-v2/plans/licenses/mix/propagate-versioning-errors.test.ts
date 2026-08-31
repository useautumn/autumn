/**
 * catalogV2.update — propagate.license_parents pin guards.
 * Missing pin is a schema 400. Off-anchor / missing plan → InvalidPropagationTarget.
 * Source new_version + historical parent with customers → 400.
 */
import { test } from "bun:test";
import { ErrCode } from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import { seedDivergedChildAnchors } from "../utils/atmnPutDirectVersions.js";
import { seedVersionableCustomer } from "../../migrations/utils/seedVersionableCustomer.js";
import {
	bumpChild,
	messagesItem,
	seedLinkedChildParent,
	seedTwoParentVersions,
	withCatalogPlans,
} from "../utils/seedLicensePlans.js";

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: propagate target missing pin → 400")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_err_pin_p");
		const childId = uniqueTestId("cv2_lic_err_pin_c");
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
					errMessage: "Propagate targets must pin a row",
					func: () =>
						bumpChild({
							autumn: autumnV2_3,
							childId,
							propagate: {
								license_parents: [{ plan_id: parentId }],
							},
						}),
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: off-anchor parent pin → 400")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_err_offv_p");
		const childId = uniqueTestId("cv2_lic_err_offv_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await seedDivergedChildAnchors({
					autumn: autumnV2_3,
					childId,
					parentId,
				});
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

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: pin a missing parent → 400")}`,
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
					errCode: ErrCode.InvalidPropagationTarget,
					errMessage: `Invalid propagation target: ${missingId}`,
					func: () =>
						bumpChild({
							autumn: autumnV2_3,
							childId,
							propagate: {
								license_parents: [{ plan_id: missingId, version: 1 }],
							},
						}),
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: new_version + historical parent with customers → 400")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_err_hist_p");
		const childId = uniqueTestId("cv2_lic_err_hist_c");
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
					version: 1,
				});
				await expectAutumnError({
					errCode: ErrCode.InvalidRequest,
					errMessage: "historical version has customers",
					func: () =>
						bumpChild({
							autumn: autumnV2_3,
							childId,
							versioning: "new_version",
							propagate: {
								license_parents: [{ plan_id: parentId, version: 1 }],
							},
						}),
				});
			},
		});
	},
);
