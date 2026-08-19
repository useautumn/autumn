/**
 * catalogV2.update — create a variant from `plans[].variants[]`.
 *
 * Contract:
 *   - existing base + variants[{ id, name }] → v1, pointer set, items cloned
 *   - same-call create base + variant → both exist, pointer set
 *   - customize on create → clone + overlay
 *   - preview writes nothing; results include the variant create
 */

import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import {
	expectCatalogPreviewCorrect,
	expectCatalogResultsCorrect,
} from "../../../utils/expectCatalogUpdate.js";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import {
	deleteDbPlans,
	expectCatalogPlansCorrect,
	expectDbPlansAbsent,
} from "../../utils/expectCatalogPlans.js";
import { messagesItem } from "../../licenses/utils/seedLicensePlans.js";
import {
	expectVariantPlanCorrect,
	expectVariantPointerCorrect,
} from "../utils/expectVariantPointer.js";

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants create: existing base + name stamps pointer and clones items")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_base");
		const variantId = uniqueTestId("cv2_var_eu");
		await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: baseId,
						name: "Team",
						items: [messagesItem(100)],
					},
				],
			});

			const params = {
				plans: [
					{
						plan_id: baseId,
						variants: [{ variant_plan_id: variantId, name: "Team EU" }],
					},
				],
			};

			const preview = await autumnV2_3.catalogV2.previewUpdate(params);
			expectCatalogPreviewCorrect({
				preview,
				plans: [{ planId: baseId, action: "none" }],
			});
			await expectDbPlansAbsent({ ctx, planIds: [variantId] });

			const response = await autumnV2_3.catalogV2.update(params);
			expectCatalogResultsCorrect({
				response,
				plans: [
					{ id: baseId, action: "none" },
					{ id: variantId, action: "create" },
				],
			});
			await expectVariantPlanCorrect({
				ctx,
				variantPlanId: variantId,
				name: "Team EU",
				allowances: { [TestFeature.Messages]: 100 },
			});
			await expectVariantPointerCorrect({
				ctx,
				variantPlanId: variantId,
				basePlanId: baseId,
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants create: same-call base + variant")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_both_b");
		const variantId = uniqueTestId("cv2_var_both_v");
		await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		try {
			const response = await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: baseId,
						name: "Team",
						items: [messagesItem(50)],
						variants: [{ variant_plan_id: variantId, name: "Team EU" }],
					},
				],
			});
			expectCatalogResultsCorrect({
				response,
				plans: [
					{ id: baseId, action: "create" },
					{ id: variantId, action: "create" },
				],
			});
			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [{ id: baseId, name: "Team" }],
			});
			await expectVariantPlanCorrect({
				ctx,
				variantPlanId: variantId,
				name: "Team EU",
				allowances: { [TestFeature.Messages]: 50 },
			});
			await expectVariantPointerCorrect({
				ctx,
				variantPlanId: variantId,
				basePlanId: baseId,
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants create: customize overlays the clone")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_cust_b");
		const variantId = uniqueTestId("cv2_var_cust_v");
		await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: baseId,
						name: "Team",
						items: [messagesItem(100), { feature_id: TestFeature.Dashboard }],
						variants: [
							{
								variant_plan_id: variantId,
								name: "Team EU",
								customize: {
									remove_items: [{ feature_id: TestFeature.Messages }],
									add_items: [messagesItem(300)],
								},
							},
						],
					},
				],
			});
			await expectVariantPlanCorrect({
				ctx,
				variantPlanId: variantId,
				allowances: { [TestFeature.Messages]: 300 },
				featureIds: [TestFeature.Messages, TestFeature.Dashboard],
			});
			await expectVariantPointerCorrect({
				ctx,
				variantPlanId: variantId,
				basePlanId: baseId,
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		}
	},
);
