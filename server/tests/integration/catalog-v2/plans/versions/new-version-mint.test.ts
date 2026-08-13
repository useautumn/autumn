/**
 * catalogV2.update — versioning: "new_version" mint mechanics.
 *
 * Clones latest (same id, version max+1, new internal_id), copies ents/prices
 * with fresh row ids, applies param changes on top. Old version is untouched.
 */

import { expect, test } from "bun:test";
import {
	BillingInterval,
	FreeTrialDuration,
	type GetCatalogResponse,
	ResetInterval,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { expectCatalogResultsCorrect } from "../../utils/expectCatalogUpdate.js";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import {
	deleteDbPlans,
	expectCatalogPlansCorrect,
	expectDbPlansCorrect,
	expectPlanVersionsCorrect,
} from "../utils/expectCatalogPlans.js";
import {
	expectPlanRowIdsReminted,
	expectPlanRowsCorrect,
	snapshotPlanRows,
} from "../utils/expectPlanRows.js";

type CatalogPlan = GetCatalogResponse["plans"][number];

const messagesItem = (included: number) => ({
	feature_id: TestFeature.Messages,
	included,
	reset: { interval: ResetInterval.Month },
});

const dashboardItem = { feature_id: TestFeature.Dashboard };

const trial7d = {
	duration_length: 7,
	duration_type: FreeTrialDuration.Day,
	card_required: false,
};

const billingControls = {
	overage_allowed: [{ feature_id: TestFeature.Messages, enabled: true }],
};

const catalogPlan = async ({
	autumn,
	planId,
}: {
	autumn: Awaited<ReturnType<typeof initScenario>>["autumnV2_3"];
	planId: string;
}): Promise<CatalogPlan> => {
	const catalog = await autumn.catalogV2.get({ include_archived: true });
	const plan = catalog.plans.find((candidate) => candidate.id === planId);
	expect(plan, `missing catalog plan ${planId}`).toBeDefined();
	if (!plan) throw new Error(`missing catalog plan ${planId}`);
	return plan;
};

test.concurrent(
	`${chalk.yellowBright("catalogV2 new_version: old version byte-untouched after details mint")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_nv_untouched");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Mint V1",
						metadata: { source: "mint-v1" },
						price: { amount: 20, interval: BillingInterval.Month },
						items: [messagesItem(100), dashboardItem],
						free_trial: trial7d,
					},
				],
			});
			const apiV1 = await catalogPlan({ autumn: autumnV2_3, planId });
			const v1Before = await snapshotPlanRows({ ctx, planId, version: 1 });

			const response = await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Mint V2",
						versioning: "new_version",
					},
				],
			});
			expectCatalogResultsCorrect({
				response,
				plans: [{ id: planId, action: "create" }],
			});

			await expectPlanRowsCorrect({
				ctx,
				before: v1Before,
				expected: {
					stableEnts: true,
					stableFeaturePrices: true,
					stableBase: true,
					noCustomStamps: true,
				},
			});
			await expectDbPlansCorrect({
				ctx,
				expected: [
					{
						id: planId,
						version: 1,
						name: "Mint V1",
						featureIds: [TestFeature.Messages, TestFeature.Dashboard],
						allowances: { [TestFeature.Messages]: 100 },
						basePrice: { amount: 20, interval: BillingInterval.Month },
						freeTrial: { ...trial7d, on_end: null },
						metadata: { source: "mint-v1" },
					},
					{
						id: planId,
						version: 2,
						name: "Mint V2",
					},
				],
			});
			expect(apiV1.name).toBe("Mint V1");
			expect(apiV1.items.map((item) => item.feature_id).sort()).toEqual(
				[TestFeature.Dashboard, TestFeature.Messages].sort(),
			);
			expect(apiV1.price?.amount).toBe(20);
			expect(apiV1.free_trial?.duration_length).toBe(7);
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 new_version: changed item minted; untouched items copied with new ids")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_nv_items");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Items V1",
						items: [messagesItem(100), dashboardItem],
					},
				],
			});
			const v1Before = await snapshotPlanRows({ ctx, planId, version: 1 });

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						items: [messagesItem(200), dashboardItem],
						versioning: "new_version",
					},
				],
			});

			await expectPlanRowsCorrect({
				ctx,
				before: v1Before,
				expected: {
					stableEnts: true,
					noCustomStamps: true,
				},
			});
			const v2 = await snapshotPlanRows({ ctx, planId, version: 2 });
			expectPlanRowIdsReminted({ from: v1Before, to: v2 });
			expect(v2.ents[TestFeature.Messages]?.allowance).toBe(200);
			expect(v2.ents[TestFeature.Dashboard]?.id).not.toBe(
				v1Before.ents[TestFeature.Dashboard]?.id,
			);
			await expectDbPlansCorrect({
				ctx,
				expected: [
					{
						id: planId,
						version: 1,
						allowances: { [TestFeature.Messages]: 100 },
					},
					{
						id: planId,
						version: 2,
						allowances: { [TestFeature.Messages]: 200 },
						featureIds: [TestFeature.Messages, TestFeature.Dashboard],
					},
				],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 new_version: omitted facets carried; all v2 row ids reminted")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_nv_carry");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Carry V1",
						metadata: { source: "carry" },
						billing_controls: billingControls,
						price: { amount: 20, interval: BillingInterval.Month },
						items: [messagesItem(100), dashboardItem],
						free_trial: trial7d,
					},
				],
			});
			const v1Before = await snapshotPlanRows({ ctx, planId, version: 1 });

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Carry V2",
						versioning: "new_version",
					},
				],
			});

			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [
					{
						id: planId,
						version: 2,
						name: "Carry V2",
						featureIds: [TestFeature.Messages, TestFeature.Dashboard],
						allowances: { [TestFeature.Messages]: 100 },
						items: [
							{
								feature_id: TestFeature.Messages,
								included: 100,
								reset: { interval: ResetInterval.Month },
							},
							{ feature_id: TestFeature.Dashboard },
						],
						basePrice: { amount: 20, interval: BillingInterval.Month },
						freeTrial: { ...trial7d, on_end: null },
						metadata: { source: "carry" },
						billingControls,
					},
				],
			});

			const v2 = await snapshotPlanRows({ ctx, planId, version: 2 });
			expectPlanRowIdsReminted({ from: v1Before, to: v2 });
			await expectPlanRowsCorrect({
				ctx,
				before: v1Before,
				expected: {
					stableEnts: true,
					stableFeaturePrices: true,
					stableBase: true,
					noCustomStamps: true,
				},
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 new_version: is_default moves to minted version")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_nv_default");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Default V1",
						auto_enable: true,
						group: `g_${planId}`,
						items: [messagesItem(10)],
					},
				],
			});
			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [{ id: planId, isDefault: true }],
			});

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Default V2",
						versioning: "new_version",
					},
				],
			});

			await expectDbPlansCorrect({
				ctx,
				expected: [
					{ id: planId, version: 1, name: "Default V1", isDefault: false },
					{ id: planId, version: 2, name: "Default V2", isDefault: true },
				],
			});
			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [{ id: planId, version: 2, isDefault: true }],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

// spec decision pending: mint without customers
test.concurrent(
	`${chalk.yellowBright("catalogV2 new_version: mint with no customers is allowed")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_nv_nocust");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, name: "No Cus V1" }],
			});

			const response = await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "No Cus V2",
						versioning: "new_version",
					},
				],
			});
			expectCatalogResultsCorrect({
				response,
				plans: [{ id: planId, action: "create" }],
			});
			await expectPlanVersionsCorrect({
				ctx,
				planId,
				versions: [1, 2],
			});
			await expectDbPlansCorrect({
				ctx,
				expected: [
					{ id: planId, version: 1, name: "No Cus V1" },
					{ id: planId, version: 2, name: "No Cus V2" },
				],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

// spec decision pending: mint anyway vs no-op on zero diff
test.concurrent(
	`${chalk.yellowBright("catalogV2 new_version: identical params still mint a new version")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_nv_nodiff");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			const seed = {
				plan_id: planId,
				name: "Same Shape",
				items: [messagesItem(100)],
			};
			await autumnV2_3.catalogV2.update({ plans: [seed] });

			const response = await autumnV2_3.catalogV2.update({
				plans: [{ ...seed, versioning: "new_version" }],
			});
			expectCatalogResultsCorrect({
				response,
				plans: [{ id: planId, action: "create" }],
			});
			await expectPlanVersionsCorrect({
				ctx,
				planId,
				versions: [1, 2],
			});
			await expectDbPlansCorrect({
				ctx,
				expected: [
					{
						id: planId,
						version: 1,
						name: "Same Shape",
						allowances: { [TestFeature.Messages]: 100 },
					},
					{
						id: planId,
						version: 2,
						name: "Same Shape",
						allowances: { [TestFeature.Messages]: 100 },
					},
				],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);
