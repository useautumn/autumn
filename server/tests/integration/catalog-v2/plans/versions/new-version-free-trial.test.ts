/**
 * catalogV2.update — free_trial on versioning: "new_version" mint.
 *
 * Omitted trial is copied onto v2 with a new free_trials row id; null removes
 * it from v2 only; a changed shape lands on v2. v1's trial row is never touched.
 */

import { expect, test } from "bun:test";
import {
	BillingInterval,
	FreeTrialDuration,
	freeTrials,
	ResetInterval,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import {
	deleteDbPlans,
	expectDbPlansCorrect,
} from "../utils/expectCatalogPlans.js";
import {
	expectPlanRowIdsReminted,
	expectPlanRowsCorrect,
	snapshotPlanRows,
} from "../utils/expectPlanRows.js";

const getFull = async ({
	ctx,
	planId,
	version,
}: {
	ctx: AutumnContext;
	planId: string;
	version?: number;
}) =>
	ProductService.getFull({
		db: ctx.db,
		idOrInternalId: planId,
		orgId: ctx.org.id,
		env: ctx.env,
		version,
	});

const listFreeTrialRows = async ({
	ctx,
	internalProductId,
}: {
	ctx: AutumnContext;
	internalProductId: string;
}) =>
	ctx.db
		.select()
		.from(freeTrials)
		.where(eq(freeTrials.internal_product_id, internalProductId));

const trial7d = {
	duration_length: 7,
	duration_type: FreeTrialDuration.Day,
	card_required: false,
};

const trial14d = {
	duration_length: 14,
	duration_type: FreeTrialDuration.Day,
	card_required: false,
};

const messagesItem = (included: number) => ({
	feature_id: TestFeature.Messages,
	included,
	reset: { interval: ResetInterval.Month },
});

const paidWithTrial = ({
	planId,
	name,
	freeTrial = trial7d,
}: {
	planId: string;
	name: string;
	freeTrial?: typeof trial7d;
}) => ({
	plan_id: planId,
	name,
	price: { amount: 20, interval: BillingInterval.Month },
	items: [messagesItem(100)],
	free_trial: freeTrial,
});

test.concurrent(
	`${chalk.yellowBright("catalogV2 new_version: omitted free_trial copied to v2 with new row id")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_nv_ft_copy");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [paidWithTrial({ planId, name: "Trial V1" })],
			});
			const v1Before = await getFull({ ctx, planId, version: 1 });
			const v1TrialId = v1Before.free_trial?.id ?? "";
			expect(v1TrialId).toBeTruthy();

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Trial V2",
						versioning: "new_version",
					},
				],
			});

			const v1After = await getFull({ ctx, planId, version: 1 });
			const v2 = await getFull({ ctx, planId, version: 2 });
			expect(v1After.free_trial?.id).toBe(v1TrialId);
			expect(v1After.free_trial?.length).toBe(7);

			const v1Rows = await listFreeTrialRows({
				ctx,
				internalProductId: v1Before.internal_id,
			});
			expect(v1Rows).toHaveLength(1);
			expect(v1Rows[0]?.id).toBe(v1TrialId);
			expect(v1Rows[0]?.is_custom).toBe(false);

			expect(v2.free_trial?.id).toBeTruthy();
			expect(v2.free_trial?.id).not.toBe(v1TrialId);
			expect(v2.free_trial?.internal_product_id).toBe(v2.internal_id);
			await expectDbPlansCorrect({
				ctx,
				expected: [
					{
						id: planId,
						version: 1,
						freeTrial: { ...trial7d, on_end: null },
					},
					{
						id: planId,
						version: 2,
						freeTrial: { ...trial7d, on_end: null },
					},
				],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 new_version: free_trial null → v2 has no trial; v1 intact")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_nv_ft_null");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [paidWithTrial({ planId, name: "Trial V1" })],
			});
			const v1Before = await getFull({ ctx, planId, version: 1 });
			const v1TrialId = v1Before.free_trial?.id ?? "";
			expect(v1TrialId).toBeTruthy();

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Trial V2",
						free_trial: null,
						versioning: "new_version",
					},
				],
			});

			const v1After = await getFull({ ctx, planId, version: 1 });
			expect(v1After.free_trial?.id).toBe(v1TrialId);
			const v1Rows = await listFreeTrialRows({
				ctx,
				internalProductId: v1Before.internal_id,
			});
			expect(v1Rows).toHaveLength(1);
			expect(v1Rows[0]?.id).toBe(v1TrialId);

			await expectDbPlansCorrect({
				ctx,
				expected: [
					{
						id: planId,
						version: 1,
						freeTrial: { ...trial7d, on_end: null },
					},
					{ id: planId, version: 2, name: "Trial V2", freeTrial: null },
				],
			});
			const v2 = await getFull({ ctx, planId, version: 2 });
			const v2Rows = await listFreeTrialRows({
				ctx,
				internalProductId: v2.internal_id,
			});
			expect(v2Rows).toHaveLength(0);
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 new_version: changed trial on v2; trial-only mint still copies items")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_nv_ft_chg");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [paidWithTrial({ planId, name: "Trial V1" })],
			});
			const v1BeforeFull = await getFull({ ctx, planId, version: 1 });
			const v1TrialId = v1BeforeFull.free_trial?.id ?? "";
			expect(v1TrialId).toBeTruthy();
			const v1RowsBefore = await snapshotPlanRows({
				ctx,
				planId,
				version: 1,
			});

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						free_trial: trial14d,
						versioning: "new_version",
					},
				],
			});

			const v1After = await getFull({ ctx, planId, version: 1 });
			expect(v1After.free_trial?.id).toBe(v1TrialId);
			expect(v1After.free_trial?.length).toBe(7);

			await expectPlanRowsCorrect({
				ctx,
				before: v1RowsBefore,
				expected: {
					stableEnts: true,
					stableFeaturePrices: true,
					stableBase: true,
				},
			});
			const v2Rows = await snapshotPlanRows({ ctx, planId, version: 2 });
			expectPlanRowIdsReminted({ from: v1RowsBefore, to: v2Rows });

			await expectDbPlansCorrect({
				ctx,
				expected: [
					{
						id: planId,
						version: 1,
						name: "Trial V1",
						allowances: { [TestFeature.Messages]: 100 },
						basePrice: { amount: 20, interval: BillingInterval.Month },
						freeTrial: { ...trial7d, on_end: null },
					},
					{
						id: planId,
						version: 2,
						allowances: { [TestFeature.Messages]: 100 },
						basePrice: { amount: 20, interval: BillingInterval.Month },
						freeTrial: { ...trial14d, on_end: null },
					},
				],
			});
			const v2 = await getFull({ ctx, planId, version: 2 });
			expect(v2.free_trial?.id).not.toBe(v1TrialId);
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);
