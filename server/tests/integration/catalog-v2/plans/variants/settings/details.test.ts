/**
 * catalogV2.update — description / group / add_on / config / metadata
 * always fan out to latest variants. Name never copies.
 *
 * Contract:
 *   omit from propagate → settings still land; items stay drifted
 *   base rename → variant name unchanged
 *   settings + follow → both apply
 */

import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { expectCatalogResultsCorrect } from "../../../utils/expectCatalogUpdate.js";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import { deleteDbPlans } from "../../utils/expectCatalogPlans.js";
import {
	dashboardItem,
	messagesItem,
} from "../../licenses/utils/seedLicensePlans.js";
import { expectVariantPlanCorrect } from "../utils/expectVariantPointer.js";
import { seedBaseWithVariant } from "../utils/seedVariantPlans.js";

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants settings: details fan out without propagate")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_set");
		const variantId = uniqueTestId("cv2_var_set_eu");
		await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		try {
			await seedBaseWithVariant({
				autumn: autumnV2_3,
				baseId,
				variantId,
			});
			const response = await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: baseId,
						description: "after",
						group: "eu-group",
						add_on: true,
						config: { ignore_past_due: true },
						metadata: { region: "eu" },
					},
				],
			});
			expectCatalogResultsCorrect({
				response,
				plans: [
					{ id: baseId, action: "update" },
					{ id: variantId, action: "update" },
				],
			});
			await expectVariantPlanCorrect({
				ctx,
				variantPlanId: variantId,
				name: "Team EU",
				description: "after",
				group: "eu-group",
				isAddOn: true,
				config: { ignore_past_due: true },
				metadata: { region: "eu" },
				allowances: { [TestFeature.Messages]: 200 },
				featureIds: [TestFeature.Messages],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants settings: base rename leaves variant name")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_set_nm");
		const variantId = uniqueTestId("cv2_var_set_nm_eu");
		await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		try {
			await seedBaseWithVariant({
				autumn: autumnV2_3,
				baseId,
				variantId,
			});
			const response = await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: baseId, name: "Team Global" }],
			});
			expectCatalogResultsCorrect({
				response,
				plans: [{ id: baseId, action: "update" }],
			});
			await expectVariantPlanCorrect({
				ctx,
				variantPlanId: variantId,
				name: "Team EU",
				allowances: { [TestFeature.Messages]: 200 },
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants settings: follow items + billing_controls together")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_set_both");
		const variantId = uniqueTestId("cv2_var_set_both_eu");
		await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		try {
			await seedBaseWithVariant({
				autumn: autumnV2_3,
				baseId,
				variantId,
			});
			const billingControls = {
				overage_allowed: [
					{ feature_id: TestFeature.Messages, enabled: true },
				],
			};
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: baseId,
						items: [messagesItem(100), dashboardItem()],
						billing_controls: billingControls,
						propagate: { variants: [{ plan_id: variantId }] },
					},
				],
			});
			await expectVariantPlanCorrect({
				ctx,
				variantPlanId: variantId,
				name: "Team EU",
				allowances: { [TestFeature.Messages]: 200 },
				featureIds: [TestFeature.Messages, TestFeature.Dashboard],
				billingControls,
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		}
	},
);
