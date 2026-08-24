/**
 * catalogV2.update / preview_update — remove_plans error cases.
 */

import { test } from "bun:test";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import {
	deleteDbPlans,
	expectCatalogPlansCorrect,
	expectPlanVersionsCorrect,
} from "../utils/expectCatalogPlans.js";

test.concurrent(
	`${chalk.yellowBright("catalogV2 remove plans: upserting and removing the same plan in one call throws")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_rmperr_upsert");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, name: "Keep" }],
			});

			await expectAutumnError({
				errMessage: `Cannot update and remove plan ${planId} in the same call`,
				func: () =>
					autumnV2_3.catalogV2.update({
						plans: [{ plan_id: planId, name: "Renamed" }],
						remove_plans: [{ plan_id: planId }],
					}),
			});

			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [{ id: planId, name: "Keep" }],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 remove plans: unknown plan id is a 404")}`,
	async () => {
		const { autumnV2_3 } = await initScenario({ setup: [], actions: [] });
		const missingId = uniqueTestId("cv2_rmperr_missing");

		await expectAutumnError({
			errCode: "product_not_found",
			func: () =>
				autumnV2_3.catalogV2.update({
					remove_plans: [{ plan_id: missingId }],
				}),
		});
		await expectAutumnError({
			errCode: "product_not_found",
			func: () =>
				autumnV2_3.catalogV2.previewUpdate({
					remove_plans: [{ plan_id: missingId }],
				}),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 remove plans: unknown pinned version is a 404")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_rmperr_ver");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, name: "Only v1" }],
			});
			await expectAutumnError({
				errCode: "product_not_found",
				func: () =>
					autumnV2_3.catalogV2.update({
						remove_plans: [{ plan_id: planId, version: 2 }],
					}),
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 remove plans: pin-delete of an unused old version hard-deletes it")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_rmperr_old");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, name: "Historical" }],
			});
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, versioning: "new_version", active: true }],
			});

			await autumnV2_3.catalogV2.update({
				remove_plans: [{ plan_id: planId, version: 1 }],
			});

			await expectPlanVersionsCorrect({ ctx, planId, versions: [2] });
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);
