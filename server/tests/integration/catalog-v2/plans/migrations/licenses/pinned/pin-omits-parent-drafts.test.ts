/**
 * catalogV2.update — pin (omit from propagate.license_parents) never drafts
 * a parent op. Child new_version + migration.draft is already 400 in
 * validation/plan-errors.test.ts — do not duplicate.
 *
 * Contract:
 *   C1 Team in plans[] but not in propagate, Team has customers, child has none → no draft
 *   C2 Team absent from plans[] (derived pin) → no draft
 *   C3 Child new_version + pin, no draft flag → no draft
 */

import { test } from "bun:test";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../../utils/uniqueTestId.js";
import { expectPlanMessagesAllowance } from "../../../licenses/utils/expectLicenseLinkCorrect.js";
import {
	messagesItem,
	seedLinkedChildParent,
	withCatalogPlans,
} from "../../../licenses/utils/seedLicensePlans.js";
import { seedVersionableCustomer } from "../../utils/seedVersionableCustomer.js";
import { expectLicenseDraftCase } from "../utils/expectLicenseMigrationDrafts.js";

test.concurrent(
	`${chalk.yellowBright("catalogV2 license-drafts: in-batch pin does not draft the parent")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const childId = uniqueTestId("cv2_ml_c1_c");
		const teamId = uniqueTestId("cv2_ml_c1_t");
		await withCatalogPlans({
			ctx,
			planIds: [childId, teamId],
			run: async () => {
				await seedLinkedChildParent({
					autumn: autumnV2_3,
					parentId: teamId,
					childId,
				});
				await seedVersionableCustomer({ ctx, planId: teamId, version: 1 });

				await expectLicenseDraftCase({
					autumn: autumnV2_3,
					ctx,
					plans: [
						{
							plan_id: childId,
							items: [messagesItem(200)],
							migration: { draft: true },
						},
						{ plan_id: teamId },
					],
					preview: true,
					expected: [],
				});
				await expectPlanMessagesAllowance({
					ctx,
					planId: childId,
					allowance: 200,
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 license-drafts: derived pin (absent parent) does not draft")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const childId = uniqueTestId("cv2_ml_c2_c");
		const teamId = uniqueTestId("cv2_ml_c2_t");
		await withCatalogPlans({
			ctx,
			planIds: [childId, teamId],
			run: async () => {
				await seedLinkedChildParent({
					autumn: autumnV2_3,
					parentId: teamId,
					childId,
				});
				await seedVersionableCustomer({ ctx, planId: teamId, version: 1 });

				await expectLicenseDraftCase({
					autumn: autumnV2_3,
					ctx,
					plans: [
						{
							plan_id: childId,
							items: [messagesItem(200)],
							migration: { draft: true },
						},
					],
					expected: [],
				});
				await expectPlanMessagesAllowance({
					ctx,
					planId: childId,
					allowance: 200,
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 license-drafts: child new_version + pin without draft flag → no draft")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const childId = uniqueTestId("cv2_ml_c3_c");
		const teamId = uniqueTestId("cv2_ml_c3_t");
		await withCatalogPlans({
			ctx,
			planIds: [childId, teamId],
			run: async () => {
				await seedLinkedChildParent({
					autumn: autumnV2_3,
					parentId: teamId,
					childId,
				});
				await seedVersionableCustomer({ ctx, planId: teamId, version: 1 });

				await expectLicenseDraftCase({
					autumn: autumnV2_3,
					ctx,
					plans: [
						{
							plan_id: childId,
							items: [messagesItem(200)],
							versioning: "new_version", active: true,
						},
					],
					expected: [],
				});
				await expectPlanMessagesAllowance({
					ctx,
					planId: childId,
					allowance: 200,
				});
			},
		});
	},
);
