/**
 * catalogV2.update / catalogV2.preview_update — creating plans.
 *
 * Contract:
 *   - net-new plan_ids in params.plans are inserted as version 1
 *   - preview takes the same params, reports action "create", writes nothing
 *   - shaped creates (items / price / trial / flags / metadata / config / BCs)
 *     persist on the product row
 *
 * Red (current): execute/handlers for plans may still be unbuilt
 * Green (after): all three cases pass end-to-end
 */

import { test } from "bun:test";
import {
	BillingInterval,
	FreeTrialDuration,
	ResetInterval,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import {
	expectCatalogPreviewCorrect,
	expectCatalogResultsCorrect,
} from "../../utils/expectCatalogUpdate.js";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import {
	deleteDbPlans,
	expectCatalogPlansCorrect,
	expectDbPlansAbsent,
} from "../utils/expectCatalogPlans.js";

test.concurrent(
	`${chalk.yellowBright("catalogV2 create plans: preview create, update inserts minimal")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });

		const planId = uniqueTestId("cv2_min");
		const params = {
			plans: [{ plan_id: planId, name: "Minimal Plan" }],
		};

		await deleteDbPlans({ ctx, planIds: [planId] });

		try {
			const preview = await autumnV2_3.catalogV2.previewUpdate(params);
			expectCatalogPreviewCorrect({
				preview,
				plans: [{ planId, action: "create", hasCustomers: false }],
			});
			await expectDbPlansAbsent({ ctx, planIds: [planId] });

			const response = await autumnV2_3.catalogV2.update(params);
			expectCatalogResultsCorrect({
				response,
				plans: [{ id: planId, action: "create" }],
			});
			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [
					{
						id: planId,
						version: 1,
						name: "Minimal Plan",
						isAddOn: false,
						isDefault: false,
						featureIds: [],
						basePrice: null,
						freeTrial: null,
					},
				],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 create plans: boolean + metered + base price shapes")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });

		const planId = uniqueTestId("cv2_shaped");
		const params = {
			plans: [
				{
					plan_id: planId,
					name: "Shaped Plan",
					price: { amount: 20, interval: BillingInterval.Month },
					items: [
						{ feature_id: TestFeature.Dashboard },
						{
							feature_id: TestFeature.Messages,
							included: 100,
							reset: { interval: ResetInterval.Month },
						},
					],
				},
			],
		};

		await deleteDbPlans({ ctx, planIds: [planId] });

		try {
			const preview = await autumnV2_3.catalogV2.previewUpdate(params);
			expectCatalogPreviewCorrect({
				preview,
				plans: [{ planId, action: "create" }],
			});
			await expectDbPlansAbsent({ ctx, planIds: [planId] });

			const response = await autumnV2_3.catalogV2.update(params);
			expectCatalogResultsCorrect({
				response,
				plans: [{ id: planId, action: "create" }],
			});
			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [
					{
						id: planId,
						version: 1,
						name: "Shaped Plan",
						featureIds: [TestFeature.Dashboard, TestFeature.Messages],
						allowances: { [TestFeature.Messages]: 100 },
						basePrice: { amount: 20, interval: BillingInterval.Month },
					},
				],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 create plans: trial + flags + metadata + config + billing_controls")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });

		const planId = uniqueTestId("cv2_flags");
		const billingControls = {
			overage_allowed: [{ feature_id: TestFeature.Messages, enabled: true }],
		};
		const params = {
			plans: [
				{
					plan_id: planId,
					name: "Flagged Plan",
					add_on: true,
					auto_enable: true,
					metadata: { source: "catalog-v2-create", tier: 1 },
					config: { ignore_past_due: true },
					billing_controls: billingControls,
					free_trial: {
						duration_type: FreeTrialDuration.Day,
						duration_length: 14,
						card_required: false,
					},
					items: [
						{
							feature_id: TestFeature.Messages,
							included: 50,
							reset: { interval: ResetInterval.Month },
						},
					],
				},
			],
		};

		await deleteDbPlans({ ctx, planIds: [planId] });

		try {
			const preview = await autumnV2_3.catalogV2.previewUpdate(params);
			expectCatalogPreviewCorrect({
				preview,
				plans: [{ planId, action: "create" }],
			});
			await expectDbPlansAbsent({ ctx, planIds: [planId] });

			const response = await autumnV2_3.catalogV2.update(params);
			expectCatalogResultsCorrect({
				response,
				plans: [{ id: planId, action: "create" }],
			});
			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [
					{
						id: planId,
						version: 1,
						name: "Flagged Plan",
						isAddOn: true,
						// auto_enable maps to is_default on the product row
						isDefault: true,
						freeTrial: {
							duration_type: FreeTrialDuration.Day,
							duration_length: 14,
							card_required: false,
							on_end: null,
						},
						metadata: { source: "catalog-v2-create", tier: 1 },
						config: { ignore_past_due: true },
						billingControls,
						featureIds: [TestFeature.Messages],
						allowances: { [TestFeature.Messages]: 50 },
					},
				],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);
