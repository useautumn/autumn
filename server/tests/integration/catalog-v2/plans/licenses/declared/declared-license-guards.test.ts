/**
 * catalogV2.update — declared licenses[] link guards.
 *
 * Contract:
 *   self-link → 400
 *   archived child → 400
 *   prepaid_only: false → 400
 */

import { test } from "bun:test";
import { ErrCode } from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import { messagesItem, withCatalogPlans } from "../utils/seedLicensePlans.js";

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: self-link → 400")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_self_p");
		await withCatalogPlans({
			ctx,
			planIds: [parentId],
			run: async () => {
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: parentId,
							name: "Parent",
							items: [messagesItem(10)],
						},
					],
				});

				await expectAutumnError({
					errCode: ErrCode.InvalidRequest,
					errMessage: "cannot be linked as a license to itself",
					func: () =>
						autumnV2_3.catalogV2.update({
							plans: [
								{
									plan_id: parentId,
									licenses: [{ license_plan_id: parentId, included: 1 }],
								},
							],
						}),
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: archived child → 400")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_arch_p");
		const childId = uniqueTestId("cv2_lic_arch_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: childId,
							name: "Seat",
							items: [messagesItem(10)],
						},
						{ plan_id: parentId, name: "Parent" },
					],
				});
				await autumnV2_3.catalogV2.update({
					plans: [{ plan_id: childId, archived: true }],
				});

				await expectAutumnError({
					errCode: ErrCode.InvalidRequest,
					errMessage: "archived",
					func: () =>
						autumnV2_3.catalogV2.update({
							plans: [
								{
									plan_id: parentId,
									licenses: [{ license_plan_id: childId, included: 1 }],
								},
							],
						}),
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: prepaid_only: false → 400")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_pp_p");
		const childId = uniqueTestId("cv2_lic_pp_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: childId,
							name: "Seat",
							items: [messagesItem(10)],
						},
						{ plan_id: parentId, name: "Parent" },
					],
				});

				await expectAutumnError({
					errCode: ErrCode.InvalidRequest,
					errMessage: "prepaid_only: false",
					func: () =>
						autumnV2_3.catalogV2.update({
							plans: [
								{
									plan_id: parentId,
									licenses: [
										{
											license_plan_id: childId,
											included: 1,
											prepaid_only: false,
										},
									],
								},
							],
						}),
				});
			},
		});
	},
);
