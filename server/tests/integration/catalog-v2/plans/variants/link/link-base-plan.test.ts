/**
 * catalogV2.update — link an existing plan to a base with `base_plan_id`.
 *
 * Contract:
 *   base_plan_id → every version row of the plan points at the latest base row
 *   base_plan_id: null → every version row detaches
 *   omitted → pointer untouched
 *   after linking, propagate.variants reaches the newly linked plan
 */

import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import {
	dashboardItem,
	messagesItem,
} from "../../licenses/utils/seedLicensePlans.js";
import { deleteDbPlans } from "../../utils/expectCatalogPlans.js";
import {
	expectVariantPlanCorrect,
	expectVariantPointerCorrect,
	expectVariantUnlinkedCorrect,
} from "../utils/expectVariantPointer.js";
import type { CatalogV2Client } from "../utils/seedVariantPlans.js";

const seedTwoStandalonePlans = async ({
	autumn,
	monthlyId,
	yearlyId,
}: {
	autumn: CatalogV2Client;
	monthlyId: string;
	yearlyId: string;
}) => {
	await autumn.catalogV2.update({
		plans: [
			{ plan_id: monthlyId, name: "Individual", items: [messagesItem(100)] },
			{
				plan_id: yearlyId,
				name: "Individual Yearly",
				items: [messagesItem(200)],
			},
		],
	});
};

test.concurrent(
	`${chalk.yellowBright("catalogV2 base_plan_id: links every version row of an existing plan")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const monthlyId = uniqueTestId("cv2_link_m");
		const yearlyId = uniqueTestId("cv2_link_y");
		await deleteDbPlans({ ctx, planIds: [monthlyId, yearlyId] });
		try {
			await seedTwoStandalonePlans({
				autumn: autumnV2_3,
				monthlyId,
				yearlyId,
			});
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: yearlyId, versioning: "new_version" }],
			});

			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: yearlyId, base_plan_id: monthlyId }],
			});

			for (const version of [1, 2]) {
				await expectVariantPointerCorrect({
					ctx,
					variantPlanId: yearlyId,
					basePlanId: monthlyId,
					variantVersion: version,
				});
			}
			// Linking rewrites a pointer only — content stays put.
			await expectVariantPlanCorrect({
				ctx,
				variantPlanId: yearlyId,
				allowances: { [TestFeature.Messages]: 200 },
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [monthlyId, yearlyId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 base_plan_id: null detaches, omitted leaves the link alone")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const monthlyId = uniqueTestId("cv2_unlink_m");
		const yearlyId = uniqueTestId("cv2_unlink_y");
		await deleteDbPlans({ ctx, planIds: [monthlyId, yearlyId] });
		try {
			await seedTwoStandalonePlans({
				autumn: autumnV2_3,
				monthlyId,
				yearlyId,
			});
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: yearlyId, base_plan_id: monthlyId }],
			});

			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: yearlyId, name: "Individual Yearly v2" }],
			});
			await expectVariantPointerCorrect({
				ctx,
				variantPlanId: yearlyId,
				basePlanId: monthlyId,
			});

			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: yearlyId, base_plan_id: null }],
			});
			await expectVariantUnlinkedCorrect({
				ctx,
				variantPlanId: yearlyId,
				versions: [1],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [monthlyId, yearlyId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 base_plan_id: a newly linked plan follows propagate.variants")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const monthlyId = uniqueTestId("cv2_link_prop_m");
		const yearlyId = uniqueTestId("cv2_link_prop_y");
		await deleteDbPlans({ ctx, planIds: [monthlyId, yearlyId] });
		try {
			await seedTwoStandalonePlans({
				autumn: autumnV2_3,
				monthlyId,
				yearlyId,
			});
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: yearlyId, base_plan_id: monthlyId }],
			});

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: monthlyId,
						items: [messagesItem(100), dashboardItem()],
						propagate: { variants: [{ plan_id: yearlyId }] },
					},
				],
			});

			await expectVariantPlanCorrect({
				ctx,
				variantPlanId: yearlyId,
				allowances: { [TestFeature.Messages]: 200 },
				featureIds: [TestFeature.Messages, TestFeature.Dashboard],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [monthlyId, yearlyId] });
		}
	},
);
