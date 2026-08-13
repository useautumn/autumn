/**
 * catalogV2.update — multi-plan batch interactions in one call.
 *
 * Green path: create + update + archive across three distinct plan_ids with
 * preview reporting all three and writing nothing.
 * Red: duplicate plan_id creates, rename collisions / stale refs.
 */

import { test } from "bun:test";
import { ErrCode, ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
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
	`${chalk.yellowBright("catalogV2 batch-ops: create + update + archive in one call; preview writes nothing")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const createId = uniqueTestId("cv2_batch_c");
		const updateId = uniqueTestId("cv2_batch_u");
		const archiveId = uniqueTestId("cv2_batch_a");
		await deleteDbPlans({
			ctx,
			planIds: [createId, updateId, archiveId],
		});

		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: updateId,
						name: "Update Target",
						items: [
							{
								feature_id: TestFeature.Messages,
								included: 10,
								reset: { interval: ResetInterval.Month },
							},
						],
					},
					{ plan_id: archiveId, name: "Archive Target" },
				],
			});

			const params = {
				plans: [
					{ plan_id: createId, name: "Batch Create" },
					{
						plan_id: updateId,
						name: "Updated Name",
						items: [
							{
								feature_id: TestFeature.Messages,
								included: 50,
								reset: { interval: ResetInterval.Month },
							},
						],
					},
					{ plan_id: archiveId, archived: true },
				],
			};

			const preview = await autumnV2_3.catalogV2.previewUpdate(params);
			expectCatalogPreviewCorrect({
				preview,
				plans: [
					{ planId: createId, action: "create", hasCustomers: false },
					{ planId: updateId, action: "update", hasCustomers: false },
					{ planId: archiveId, action: "update", hasCustomers: false },
				],
			});
			await expectDbPlansAbsent({ ctx, planIds: [createId] });
			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [
					{ id: updateId, name: "Update Target" },
					{ id: archiveId, archived: false },
				],
			});

			const response = await autumnV2_3.catalogV2.update(params);
			expectCatalogResultsCorrect({
				response,
				plans: [
					{ id: createId, action: "create" },
					{ id: updateId, action: "update" },
					{ id: archiveId, action: "update" },
				],
			});
			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [
					{ id: createId, name: "Batch Create" },
					{
						id: updateId,
						name: "Updated Name",
						allowances: { [TestFeature.Messages]: 50 },
					},
					{ id: archiveId, archived: true },
				],
			});
		} finally {
			await deleteDbPlans({
				ctx,
				planIds: [createId, updateId, archiveId],
			});
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 batch-ops: create two plans with same plan_id → error")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_batch_dup");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await expectAutumnError({
				errCode: ErrCode.InvalidRequest,
				func: () =>
					autumnV2_3.catalogV2.update({
						plans: [
							{ plan_id: planId, name: "First" },
							{ plan_id: planId, name: "Second" },
						],
					}),
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

// RED: rename into existing plan_id not rejected
test.concurrent(
	`${chalk.yellowBright("RED: catalogV2 batch-ops: rename A→B while B already exists → error")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planA = uniqueTestId("cv2_batch_ra");
		const planB = uniqueTestId("cv2_batch_rb");
		await deleteDbPlans({ ctx, planIds: [planA, planB] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{ plan_id: planA, name: "A" },
					{ plan_id: planB, name: "B" },
				],
			});
			await expectAutumnError({
				errCode: ErrCode.InvalidRequest,
				func: () =>
					autumnV2_3.catalogV2.update({
						plans: [{ plan_id: planA, new_plan_id: planB }],
					}),
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planA, planB] });
		}
	},
);

// RED: rename into same-call create not rejected
test.concurrent(
	`${chalk.yellowBright("RED: catalogV2 batch-ops: rename A→B while B created in same call → error")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planA = uniqueTestId("cv2_batch_rca");
		const planB = uniqueTestId("cv2_batch_rcb");
		await deleteDbPlans({ ctx, planIds: [planA, planB] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planA, name: "A" }],
			});
			await expectAutumnError({
				errCode: ErrCode.InvalidRequest,
				func: () =>
					autumnV2_3.catalogV2.update({
						plans: [
							{ plan_id: planA, new_plan_id: planB },
							{ plan_id: planB, name: "New B" },
						],
					}),
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planA, planB] });
		}
	},
);

// RED: create + pinned update same plan_id — encode as error until spec decides
test.concurrent(
	`${chalk.yellowBright("RED: catalogV2 batch-ops: create + pinned v1 update same plan_id → error")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_batch_cup");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await expectAutumnError({
				errCode: ErrCode.InvalidRequest,
				func: () =>
					autumnV2_3.catalogV2.update({
						plans: [
							{ plan_id: planId, name: "Create" },
							{ plan_id: planId, version: 1, name: "Pinned" },
						],
					}),
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 batch-ops: rename A→B and update A in same call → error")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planA = uniqueTestId("cv2_batch_stale");
		const planB = uniqueTestId("cv2_batch_stale_b");
		await deleteDbPlans({ ctx, planIds: [planA, planB] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planA, name: "A" }],
			});
			await expectAutumnError({
				errCode: ErrCode.InvalidRequest,
				func: () =>
					autumnV2_3.catalogV2.update({
						plans: [
							{ plan_id: planA, new_plan_id: planB },
							{ plan_id: planA, name: "Stale Update" },
						],
					}),
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planA, planB] });
		}
	},
);
