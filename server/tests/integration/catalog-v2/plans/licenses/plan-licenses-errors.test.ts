/**
 * catalogV2.update — declared plan_license error surface.
 *
 * Missing child → 4xx; a licensed plan cannot offer licenses of its own.
 */

import { test } from "bun:test";
import { ErrCode, ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import { deleteDbPlans } from "../utils/expectCatalogPlans.js";

const messagesItem = (included: number) => ({
	feature_id: TestFeature.Messages,
	included,
	reset: { interval: ResetInterval.Month },
});

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: missing license_plan_id → 4xx")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_miss_p");
		const missingId = uniqueTestId("cv2_lic_miss_c");
		await deleteDbPlans({ ctx, planIds: [parentId, missingId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: parentId, name: "Parent" }],
			});

			await expectAutumnError({
				errCode: ErrCode.ProductNotFound,
				errMessage: missingId,
				func: () =>
					autumnV2_3.catalogV2.update({
						plans: [
							{
								plan_id: parentId,
								licenses: [{ license_plan_id: missingId, included: 1 }],
							},
						],
					}),
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [parentId, missingId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: licensed plan cannot offer licenses")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_nest_p");
		const childId = uniqueTestId("cv2_lic_nest_c");
		const grandId = uniqueTestId("cv2_lic_nest_g");
		await deleteDbPlans({ ctx, planIds: [parentId, childId, grandId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: childId,
						name: "Seat",
						items: [messagesItem(10)],
					},
					{
						plan_id: grandId,
						name: "Grand",
						items: [messagesItem(1)],
					},
					{
						plan_id: parentId,
						name: "Parent",
						licenses: [{ license_plan_id: childId, included: 1 }],
					},
				],
			});

			await expectAutumnError({
				errCode: ErrCode.InvalidRequest,
				errMessage: "offered as a license under",
				func: () =>
					autumnV2_3.catalogV2.update({
						plans: [
							{
								plan_id: childId,
								licenses: [{ license_plan_id: grandId, included: 1 }],
							},
						],
					}),
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [parentId, childId, grandId] });
		}
	},
);
