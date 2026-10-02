/**
 * catalogV2.update — versioning: "all_versions" on a default (auto_enable) plan.
 *
 * Red (current):  the dashboard restates is_default: true; the sibling fan-out copies it
 *                 onto v1, which handleDefaultFlagErrors rejects as a historical default.
 * Green (after):  the item removal lands on every version; only the latest stays default.
 */

import { test } from "bun:test";
import { ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import {
	deleteDbPlans,
	expectDbPlansCorrect,
	expectPlanVersionsCorrect,
} from "../utils/expectCatalogPlans.js";

const messagesItem = {
	feature_id: TestFeature.Messages,
	included: 100,
	reset: { interval: ResetInterval.Month },
};
const dashboardItem = { feature_id: TestFeature.Dashboard };

test.concurrent(
	`${chalk.yellowBright("catalogV2 all_versions: removing an item from a default plan's latest version patches every version")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_all_default");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Free",
						auto_enable: true,
						items: [messagesItem, dashboardItem],
					},
				],
			});
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Free",
						is_default: true,
						items: [messagesItem, dashboardItem],
						versioning: "new_version",
						active: true,
					},
				],
			});

			// Dashboard save: full restatement of the latest row, including is_default.
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Free",
						is_default: true,
						auto_enable: true,
						items: [messagesItem],
						versioning: "all_versions",
					},
				],
			});

			await expectPlanVersionsCorrect({ ctx, planId, versions: [1, 2] });
			await expectDbPlansCorrect({
				ctx,
				expected: [
					{
						id: planId,
						version: 1,
						isDefault: false,
						featureIds: [TestFeature.Messages],
					},
					{
						id: planId,
						version: 2,
						isDefault: true,
						featureIds: [TestFeature.Messages],
					},
				],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);
