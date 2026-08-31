/**
 * catalogV2.update — cannot archive or remove a child version that catalog
 * links still point at. The error names the parent plans.
 *
 * Same-call unlink (licenses: []) then remove is allowed.
 */

import { expect, test } from "bun:test";
import { ErrCode } from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import { expectLicenseLinkMissing } from "../utils/expectLicenseLinkCorrect.js";
import {
	bumpChild,
	getFullPlan,
	messagesItem,
	seedLinkedChildParent,
	withCatalogPlans,
} from "../utils/seedLicensePlans.js";
import { expectDbPlansCorrect } from "../../utils/expectCatalogPlans.js";

test.concurrent(
	`${chalk.yellowBright("catalogV2 lifecycle: remove child version still linked by a parent is 400")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_life_rm_p");
		const childId = uniqueTestId("cv2_lic_life_rm_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await seedLinkedChildParent({ autumn: autumnV2_3, parentId, childId });
				await bumpChild({
					autumn: autumnV2_3,
					childId,
					items: [messagesItem(50)],
					versioning: "new_version",
				});

				await expectAutumnError({
					errCode: ErrCode.InvalidRequest,
					errMessage: parentId,
					func: () =>
						autumnV2_3.catalogV2.update({
							remove_plans: [{ plan_id: childId, version: 1 }],
						}),
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 lifecycle: archive child version still linked by a parent is 400")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_life_arch_p");
		const childId = uniqueTestId("cv2_lic_life_arch_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await seedLinkedChildParent({ autumn: autumnV2_3, parentId, childId });
				await bumpChild({
					autumn: autumnV2_3,
					childId,
					items: [messagesItem(50)],
					versioning: "new_version",
				});
				const childV1 = await getFullPlan({ ctx, planId: childId, version: 1 });
				expect(childV1.archived).toBe(false);

				await expectAutumnError({
					errCode: ErrCode.InvalidRequest,
					errMessage: parentId,
					func: () =>
						autumnV2_3.catalogV2.update({
							plans: [{ plan_id: childId, version: 1, archived: true }],
						}),
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 lifecycle: unlink then remove the child version in one call is allowed")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_life_unl_p");
		const childId = uniqueTestId("cv2_lic_life_unl_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await seedLinkedChildParent({ autumn: autumnV2_3, parentId, childId });
				await bumpChild({
					autumn: autumnV2_3,
					childId,
					items: [messagesItem(50)],
					versioning: "new_version",
				});

				await autumnV2_3.catalogV2.update({
					plans: [{ plan_id: parentId, licenses: [] }],
					remove_plans: [{ plan_id: childId, version: 1 }],
				});

				await expectLicenseLinkMissing({
					ctx,
					parentPlanId: parentId,
					licensePlanId: childId,
				});
				await expectDbPlansCorrect({
					ctx,
					expected: [
						{ id: parentId },
						{ id: childId },
					],
				});
			},
		});
	},
);
