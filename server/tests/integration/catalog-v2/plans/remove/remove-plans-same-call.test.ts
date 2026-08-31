/**
 * catalogV2.update — remove_plans same-call license pair verdicts.
 */

import { test } from "bun:test";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import {
	expectDbPlansAbsent,
	expectDbPlansCorrect,
} from "../utils/expectCatalogPlans.js";
import { seedVersionableCustomer } from "../migrations/utils/seedVersionableCustomer.js";
import {
	messagesItem,
	withCatalogPlans,
} from "../licenses/utils/seedLicensePlans.js";

test.concurrent(
	`${chalk.yellowBright("catalogV2 remove plans: parent + child with no customers both hard delete")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_rmp_pair_p");
		const childId = uniqueTestId("cv2_rmp_pair_c");
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
						{
							plan_id: parentId,
							name: "Team",
							licenses: [{ license_plan_id: childId, included: 1 }],
						},
					],
				});
				await autumnV2_3.catalogV2.update({
					remove_plans: [{ plan_id: parentId }, { plan_id: childId }],
				});
				await expectDbPlansAbsent({ ctx, planIds: [parentId, childId] });
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 remove plans: parent with customers cannot remove a still-linked child")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_rmp_pair_cus_p");
		const childId = uniqueTestId("cv2_rmp_pair_cus_c");
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
						{
							plan_id: parentId,
							name: "Team",
							licenses: [{ license_plan_id: childId, included: 1 }],
						},
					],
				});
				await seedVersionableCustomer({ ctx, planId: parentId });
				await expectAutumnError({
					errMessage: `Cannot archive or remove ${childId} version 1 while ${parentId} still links to it`,
					func: () =>
						autumnV2_3.catalogV2.update({
							remove_plans: [{ plan_id: parentId }, { plan_id: childId }],
						}),
				});
				await expectDbPlansCorrect({
					ctx,
					expected: [
						{ id: parentId, archived: false },
						{ id: childId, archived: false },
					],
				});
			},
		});
	},
);
