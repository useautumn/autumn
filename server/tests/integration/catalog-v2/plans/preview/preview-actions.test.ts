/**
 * catalogV2.preview_update — action correctness for plans.
 *
 * Asserts create / update / none / archive / multi-plan / pinned-version /
 * preview↔update parity. Always schema-parses the response and checks
 * preview writes nothing.
 */

import { expect, test } from "bun:test";
import {
	BillingInterval,
	PreviewUpdateCatalogResponseSchema,
	ResetInterval,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import {
	deleteDbPlans,
	expectCatalogPlansCorrect,
	expectDbPlansAbsent,
	expectDbPlansCorrect,
} from "../utils/expectCatalogPlans.js";
import {
	expectPlanPreviewRowCorrect,
	expectPlanPreviewRowsCorrect,
	parsePlanPreview,
} from "./utils/expectPlanPreview.js";

test.concurrent(
	`${chalk.yellowBright("catalogV2 preview-actions: new plan_id → create")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_pa_create");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			const params = {
				plans: [{ plan_id: planId, name: "Preview Create" }],
			};
			const preview = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate(params),
			);
			PreviewUpdateCatalogResponseSchema.parse(preview);
			expectPlanPreviewRowCorrect({
				preview,
				expected: { planId, action: "create", name: "Preview Create" },
			});
			await expectDbPlansAbsent({ ctx, planIds: [planId] });
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 preview-actions: detail-only diff → update")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_pa_det");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, name: "Before" }],
			});
			const params = {
				plans: [{ plan_id: planId, name: "After" }],
			};
			const preview = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate(params),
			);
			expectPlanPreviewRowCorrect({
				preview,
				expected: { planId, action: "update" },
			});
			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [{ id: planId, name: "Before" }],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 preview-actions: items-only diff → update")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_pa_items");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Items",
						items: [
							{
								feature_id: TestFeature.Messages,
								included: 10,
								reset: { interval: ResetInterval.Month },
							},
						],
					},
				],
			});
			const params = {
				plans: [
					{
						plan_id: planId,
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
			const preview = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate(params),
			);
			expectPlanPreviewRowCorrect({
				preview,
				expected: { planId, action: "update" },
			});
			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [{ id: planId, allowances: { [TestFeature.Messages]: 10 } }],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 preview-actions: base-price-only diff → update")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_pa_price");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Priced",
						price: { amount: 20, interval: BillingInterval.Month },
					},
				],
			});
			const params = {
				plans: [
					{
						plan_id: planId,
						price: { amount: 30, interval: BillingInterval.Month },
					},
				],
			};
			const preview = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate(params),
			);
			expectPlanPreviewRowCorrect({
				preview,
				expected: { planId, action: "update" },
			});
			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [
					{
						id: planId,
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
	`${chalk.yellowBright("catalogV2 preview-actions: identical re-send → none")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_pa_none");
		const params = {
			plans: [
				{
					plan_id: planId,
					name: "Same",
					items: [{ feature_id: TestFeature.Dashboard }],
					price: { amount: 10, interval: BillingInterval.Month },
				},
			],
		};
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update(params);
			const preview = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate(params),
			);
			expectPlanPreviewRowCorrect({
				preview,
				expected: { planId, action: "none" },
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 preview-actions: explicit defaults → none (no false positive)")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_pa_defs");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Defaults",
						items: [{ feature_id: TestFeature.Dashboard }],
						price: { amount: 10, interval: BillingInterval.Month },
					},
				],
			});
			const params = {
				plans: [
					{
						plan_id: planId,
						name: "Defaults",
						items: [
							{
								feature_id: TestFeature.Dashboard,
								included: 0,
								pooled: false,
							},
						],
						price: {
							amount: 10,
							interval: BillingInterval.Month,
							interval_count: 1,
						},
					},
				],
			};
			const preview = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate(params),
			);
			expectPlanPreviewRowCorrect({
				preview,
				expected: { planId, action: "none" },
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 preview-actions: omit items/price lanes → none")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_pa_omit");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Keep Lanes",
						items: [
							{
								feature_id: TestFeature.Messages,
								included: 10,
								reset: { interval: ResetInterval.Month },
							},
						],
						price: { amount: 20, interval: BillingInterval.Month },
					},
				],
			});
			const params = {
				plans: [{ plan_id: planId, name: "Keep Lanes" }],
			};
			const preview = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate(params),
			);
			expectPlanPreviewRowCorrect({
				preview,
				expected: { planId, action: "none" },
			});
			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [
					{
						id: planId,
						allowances: { [TestFeature.Messages]: 10 },
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
	`${chalk.yellowBright("catalogV2 preview-actions: archived toggle → update")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_pa_arch");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, name: "Archive Me" }],
			});
			const params = {
				plans: [{ plan_id: planId, archived: true }],
			};
			const preview = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate(params),
			);
			expectPlanPreviewRowCorrect({
				preview,
				expected: { planId, action: "update" },
			});
			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [{ id: planId, archived: false }],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 preview-actions: multi-plan create + update + none")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const createId = uniqueTestId("cv2_pa_mc");
		const updateId = uniqueTestId("cv2_pa_mu");
		const noneId = uniqueTestId("cv2_pa_mn");
		await deleteDbPlans({ ctx, planIds: [createId, updateId, noneId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{ plan_id: updateId, name: "Will Update" },
					{ plan_id: noneId, name: "Stay Same" },
				],
			});
			const params = {
				plans: [
					{ plan_id: createId, name: "New" },
					{ plan_id: updateId, name: "Updated" },
					{ plan_id: noneId, name: "Stay Same" },
				],
			};
			const preview = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate(params),
			);
			expectPlanPreviewRowsCorrect({
				preview,
				expected: [
					{ planId: createId, action: "create" },
					{ planId: updateId, action: "update" },
					{ planId: noneId, action: "none" },
				],
			});
			await expectDbPlansAbsent({ ctx, planIds: [createId] });
		} finally {
			await deleteDbPlans({
				ctx,
				planIds: [createId, updateId, noneId],
			});
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 preview-actions: pinned version:1 action against v1 not latest")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_pa_pin");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, name: "V1 Name" }],
			});
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, version: 2, name: "V2 Name" }],
			});

			// Re-send v1's current name → none against v1; latest stays V2.
			const nonePreview = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [{ plan_id: planId, version: 1, name: "V1 Name" }],
				}),
			);
			expectPlanPreviewRowCorrect({
				preview: nonePreview,
				expected: { planId, action: "none" },
			});

			const updatePreview = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [{ plan_id: planId, version: 1, name: "V1 Renamed" }],
				}),
			);
			expectPlanPreviewRowCorrect({
				preview: updatePreview,
				expected: { planId, action: "update" },
			});
			await expectDbPlansCorrect({
				ctx,
				expected: [
					{ id: planId, version: 1, name: "V1 Name" },
					{ id: planId, version: 2, name: "V2 Name" },
				],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 preview-actions: update results.plans actions match preview")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const createId = uniqueTestId("cv2_pa_par_c");
		const updateId = uniqueTestId("cv2_pa_par_u");
		const noneId = uniqueTestId("cv2_pa_par_n");
		await deleteDbPlans({ ctx, planIds: [createId, updateId, noneId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{ plan_id: updateId, name: "Before" },
					{ plan_id: noneId, name: "Stable" },
				],
			});
			const params = {
				plans: [
					{ plan_id: createId, name: "Created" },
					{ plan_id: updateId, name: "After" },
					{ plan_id: noneId, name: "Stable" },
				],
			};
			const preview = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate(params),
			);
			const response = await autumnV2_3.catalogV2.update(params);

			for (const planId of [createId, updateId, noneId]) {
				const previewAction = preview.plans.find(
					(row) => row.plan_id === planId,
				)?.action;
				const resultAction = response.results.plans.find(
					(row) => row.id === planId,
				)?.action;
				expect(resultAction).toBe(previewAction);
			}
		} finally {
			await deleteDbPlans({
				ctx,
				planIds: [createId, updateId, noneId],
			});
		}
	},
);
