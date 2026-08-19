/**
 * catalogV2.update — unarchive width.
 *
 * Archiving goes through `remove_plans` and hits every version, so an unarchive
 * must say `versioning: "all_versions"` to come back symmetric. Default width
 * stays latest-only.
 */

import { test } from "bun:test";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import { seedVersionableCustomer } from "../migrations/utils/seedVersionableCustomer.js";
import { cleanupPlanCustomerRefs } from "../utils/cleanupPlanCustomerRefs.js";
import {
	deleteDbPlans,
	expectDbPlansCorrect,
} from "../utils/expectCatalogPlans.js";

/** Two versions, both archived — a customer ref forces archive over delete. */
const seedArchivedTwoVersionPlan = async ({
	autumn,
	ctx,
	planId,
}: {
	autumn: Awaited<ReturnType<typeof initScenario>>["autumnV2_3"];
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	planId: string;
}) => {
	await autumn.catalogV2.update({ plans: [{ plan_id: planId, name: "V1" }] });
	await autumn.catalogV2.update({
		plans: [{ plan_id: planId, version: 2, name: "V2" }],
	});
	await seedVersionableCustomer({ ctx, planId, version: 1 });
	await autumn.catalogV2.update({ remove_plans: [{ plan_id: planId }] });
	await expectDbPlansCorrect({
		ctx,
		expected: [
			{ id: planId, version: 1, archived: true },
			{ id: planId, version: 2, archived: true },
		],
	});
};

test.concurrent(
	`${chalk.yellowBright("catalogV2 unarchive plans: all_versions clears archived on every version")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_unarch_all");
		await cleanupPlanCustomerRefs({ ctx, planIds: [planId] });
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await seedArchivedTwoVersionPlan({ autumn: autumnV2_3, ctx, planId });

			await autumnV2_3.catalogV2.update({
				plans: [
					{ plan_id: planId, archived: false, versioning: "all_versions" },
				],
			});

			await expectDbPlansCorrect({
				ctx,
				expected: [
					{ id: planId, version: 1, archived: false },
					{ id: planId, version: 2, archived: false },
				],
			});
		} finally {
			await cleanupPlanCustomerRefs({ ctx, planIds: [planId] });
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 unarchive plans: default width leaves older versions archived")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_unarch_latest");
		await cleanupPlanCustomerRefs({ ctx, planIds: [planId] });
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await seedArchivedTwoVersionPlan({ autumn: autumnV2_3, ctx, planId });

			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, archived: false }],
			});

			await expectDbPlansCorrect({
				ctx,
				expected: [
					{ id: planId, version: 1, archived: true },
					{ id: planId, version: 2, archived: false },
				],
			});
		} finally {
			await cleanupPlanCustomerRefs({ ctx, planIds: [planId] });
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);
