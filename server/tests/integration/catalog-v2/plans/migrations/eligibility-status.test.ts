/**
 * catalogV2.update — which customer statuses (and creates) produce a draft.
 *
 * Contract:
 *   Paused is versionable → draft
 *   Expired is not → no draft
 *   Create (no existing customers) + draft → no draft
 */

import { expect, test } from "bun:test";
import { CusProductStatus, ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import { cleanupPlanCustomerRefs } from "../utils/cleanupPlanCustomerRefs.js";
import { deleteDbPlans } from "../utils/expectCatalogPlans.js";
import {
	deleteMigrations,
	expectUpdateMigrations,
} from "./utils/expectMigrationDrafts.js";
import { seedVersionableCustomer } from "./utils/seedVersionableCustomer.js";

const messagesItem = ({ included }: { included: number }) => ({
	feature_id: TestFeature.Messages,
	included,
	reset: { interval: ResetInterval.Month },
});

const seedPlan = async ({
	autumn,
	planId,
}: {
	autumn: Awaited<ReturnType<typeof initScenario>>["autumnV2_3"];
	planId: string;
}) => {
	await autumn.catalogV2.update({
		plans: [
			{
				plan_id: planId,
				name: "Status Plan",
				items: [messagesItem({ included: 100 })],
			},
		],
	});
};

test.concurrent(
	`${chalk.yellowBright("catalogV2 migration: paused customer still produces a draft")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_mig_pause");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await seedPlan({ autumn: autumnV2_3, planId });
			await seedVersionableCustomer({
				ctx,
				planId,
				version: 1,
				status: CusProductStatus.Paused,
			});

			const response = await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						items: [messagesItem({ included: 500 })],
						migration: { draft: true },
					},
				],
			});
			expectUpdateMigrations({
				response,
				plans: [[{ plan_id: planId, versions: [1] }]],
			});
			await deleteMigrations({
				ctx,
				ids: (response.migrations ?? []).map((migration) => migration.id),
			});
		} finally {
			await cleanupPlanCustomerRefs({ ctx, planIds: [planId] });
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 migration: expired-only customers → no draft")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_mig_exp");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await seedPlan({ autumn: autumnV2_3, planId });
			await seedVersionableCustomer({
				ctx,
				planId,
				version: 1,
				status: CusProductStatus.Expired,
			});

			const response = await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						items: [messagesItem({ included: 500 })],
						migration: { draft: true },
					},
				],
			});
			expect(response.migrations ?? []).toHaveLength(0);
		} finally {
			await cleanupPlanCustomerRefs({ ctx, planIds: [planId] });
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 migration: create + draft → no draft")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_mig_new");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			const response = await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Brand New",
						items: [messagesItem({ included: 100 })],
						migration: { draft: true },
					},
				],
			});
			expect(response.migrations ?? []).toHaveLength(0);
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);
