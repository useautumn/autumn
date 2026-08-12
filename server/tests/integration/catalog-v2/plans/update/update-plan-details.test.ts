/**
 * catalogV2.update — plan detail facets (name/description/group/metadata/
 * config/billing_controls/archive/rename/auto_enable). free_trial lives in
 * update-plan-free-trial.test.ts (section 14).
 */

import { expect, test } from "bun:test";
import { BillingInterval, ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { ProductService } from "@/internal/products/ProductService.js";
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
	`${chalk.yellowBright("catalogV2 update details: name / description / group persist")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_det_name");

		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Original",
						description: "before",
						group: "g1",
					},
				],
			});

			const params = {
				plans: [
					{
						plan_id: planId,
						name: "Renamed",
						description: "after",
						group: "g2",
					},
				],
			};
			// preview.changes is always null today — previous_attributes not wired yet.
			const preview = await autumnV2_3.catalogV2.previewUpdate(params);
			expectCatalogPreviewCorrect({
				preview,
				plans: [{ planId, action: "update" }],
			});

			const response = await autumnV2_3.catalogV2.update(params);
			expectCatalogResultsCorrect({
				response,
				plans: [{ id: planId, action: "update" }],
			});
			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [
					{
						id: planId,
						name: "Renamed",
						description: "after",
						group: "g2",
					},
				],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 update details: details-only leaves item/price row ids stable")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_det_stable");

		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Stable Rows",
						price: { amount: 20, interval: BillingInterval.Month },
						items: [
							{
								feature_id: TestFeature.Messages,
								included: 100,
								reset: { interval: ResetInterval.Month },
							},
						],
					},
				],
			});

			const before = await ProductService.getFull({
				db: ctx.db,
				idOrInternalId: planId,
				orgId: ctx.org.id,
				env: ctx.env,
			});
			const beforeEntIds = before.entitlements.map((ent) => ent.id).sort();
			const beforePriceIds = before.prices.map((price) => price.id).sort();

			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, name: "Stable Rows v2", description: "d" }],
			});

			const after = await ProductService.getFull({
				db: ctx.db,
				idOrInternalId: planId,
				orgId: ctx.org.id,
				env: ctx.env,
			});
			expect(after.entitlements.map((ent) => ent.id).sort()).toEqual(
				beforeEntIds,
			);
			expect(after.prices.map((price) => price.id).sort()).toEqual(
				beforePriceIds,
			);
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 update details: metadata + config ignore_past_due")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_det_meta");

		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Meta Plan",
						metadata: { a: 1 },
						config: { ignore_past_due: false },
					},
				],
			});

			const response = await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						metadata: { a: 2, b: "x" },
						config: { ignore_past_due: true },
					},
				],
			});
			expectCatalogResultsCorrect({
				response,
				plans: [{ id: planId, action: "update" }],
			});
			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [
					{
						id: planId,
						metadata: { a: 2, b: "x" },
						config: { ignore_past_due: true },
					},
				],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 update details: billing_controls patch persists / identical → none")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_det_bc");
		const billingControls = {
			overage_allowed: [{ feature_id: TestFeature.Messages, enabled: true }],
		};
		const spendLimits = {
			spend_limits: [
				{
					feature_id: TestFeature.Messages,
					overage_limit: 50,
					enabled: true,
				},
			],
		};

		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, name: "BC Plan" }],
			});

			const response = await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, billing_controls: billingControls }],
			});
			expectCatalogResultsCorrect({
				response,
				plans: [{ id: planId, action: "update" }],
			});
			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [{ id: planId, billingControls }],
			});

			const noneResponse = await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, billing_controls: billingControls }],
			});
			expectCatalogResultsCorrect({
				response: noneResponse,
				plans: [{ id: planId, action: "none" }],
			});

			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, billing_controls: spendLimits }],
			});
			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [
					{
						id: planId,
						billingControls: {
							...billingControls,
							...spendLimits,
						},
					},
				],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 update details: billing_controls clear via empty array; other columns untouched")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_det_bc_clear");
		const overageAllowed = [
			{ feature_id: TestFeature.Messages, enabled: true },
		];
		const spendLimits = [
			{ feature_id: TestFeature.Messages, overage_limit: 50, enabled: true },
		];

		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "BC Clear",
						billing_controls: {
							overage_allowed: overageAllowed,
							spend_limits: spendLimits,
						},
					},
				],
			});

			const response = await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, billing_controls: { spend_limits: [] } }],
			});
			expectCatalogResultsCorrect({
				response,
				plans: [{ id: planId, action: "update" }],
			});
			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [
					{
						id: planId,
						billingControlsExact: {
							overage_allowed: overageAllowed,
							spend_limits: [],
						},
					},
				],
			});

			// Re-sending the cleared lane is a no-op.
			const noneResponse = await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, billing_controls: { spend_limits: [] } }],
			});
			expectCatalogResultsCorrect({
				response: noneResponse,
				plans: [{ id: planId, action: "none" }],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 update details: billing_controls batch — two plans in one call, no cross-contamination")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planA = uniqueTestId("cv2_det_bc_a");
		const planB = uniqueTestId("cv2_det_bc_b");
		const controlsA = {
			overage_allowed: [{ feature_id: TestFeature.Messages, enabled: true }],
		};
		const controlsB = {
			spend_limits: [
				{ feature_id: TestFeature.Messages, overage_limit: 25, enabled: true },
			],
		};

		await deleteDbPlans({ ctx, planIds: [planA, planB] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{ plan_id: planA, name: "BC Batch A" },
					{ plan_id: planB, name: "BC Batch B" },
				],
			});

			const response = await autumnV2_3.catalogV2.update({
				plans: [
					{ plan_id: planA, billing_controls: controlsA },
					{ plan_id: planB, billing_controls: controlsB },
				],
			});
			expectCatalogResultsCorrect({
				response,
				plans: [
					{ id: planA, action: "update" },
					{ id: planB, action: "update" },
				],
			});
			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [
					{ id: planA, billingControlsExact: controlsA },
					{ id: planB, billingControlsExact: controlsB },
				],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planA, planB] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 update details: archive / unarchive; omit preserves")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_det_arch");

		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, name: "Archive Me" }],
			});

			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, archived: true }],
			});
			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [{ id: planId, archived: true }],
			});

			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, name: "Still Archived" }],
			});
			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [{ id: planId, name: "Still Archived", archived: true }],
			});

			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, archived: false }],
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
	`${chalk.yellowBright("catalogV2 update details: new_plan_id clean rename (no customers)")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_det_ren_a");
		const newPlanId = uniqueTestId("cv2_det_ren_b");

		await deleteDbPlans({ ctx, planIds: [planId, newPlanId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Rename Me",
						price: { amount: 10, interval: BillingInterval.Month },
						items: [
							{
								feature_id: TestFeature.Messages,
								included: 50,
								reset: { interval: ResetInterval.Month },
							},
						],
					},
				],
			});

			const before = await ProductService.getFull({
				db: ctx.db,
				idOrInternalId: planId,
				orgId: ctx.org.id,
				env: ctx.env,
			});
			const beforeEntIds = before.entitlements.map((ent) => ent.id).sort();
			const beforePriceIds = before.prices.map((price) => price.id).sort();
			const beforeInternalId = before.internal_id;

			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, new_plan_id: newPlanId }],
			});

			await expectDbPlansAbsent({ ctx, planIds: [planId] });
			const after = await ProductService.getFull({
				db: ctx.db,
				idOrInternalId: newPlanId,
				orgId: ctx.org.id,
				env: ctx.env,
			});
			expect(after.internal_id).toBe(beforeInternalId);
			expect(after.version).toBe(1);
			expect(after.entitlements.map((ent) => ent.id).sort()).toEqual(
				beforeEntIds,
			);
			expect(after.prices.map((price) => price.id).sort()).toEqual(
				beforePriceIds,
			);
			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [{ id: newPlanId, name: "Rename Me", version: 1 }],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId, newPlanId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 update details: auto_enable toggles is_default")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_det_def");

		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Defaultable",
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

			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, auto_enable: true }],
			});
			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [{ id: planId, isDefault: true }],
			});

			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, auto_enable: false }],
			});
			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [{ id: planId, isDefault: false }],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);
