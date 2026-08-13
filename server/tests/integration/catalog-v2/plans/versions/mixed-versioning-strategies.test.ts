/**
 * catalogV2.update — mixed versioning strategies in one call.
 *
 * Plan A new_version, B all_versions, C pinned in-place, D create. Each
 * plan's outcome is independent. Preview versioning blocks match the update.
 */

import { test } from "bun:test";
import { ResetInterval } from "@autumn/shared";
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
	expectPlanPreviewRowCorrect,
	expectPlanPreviewRowsCorrect,
	parsePlanPreview,
} from "../preview/utils/expectPlanPreview.js";

const messagesItem = (included: number) => ({
	feature_id: TestFeature.Messages,
	included,
	reset: { interval: ResetInterval.Month },
});

const seedTwoVersions = async ({
	autumn,
	planId,
	v1Name,
	v2Name,
}: {
	autumn: Awaited<ReturnType<typeof initScenario>>["autumnV2_3"];
	planId: string;
	v1Name: string;
	v2Name: string;
}) => {
	await autumn.catalogV2.update({
		plans: [
			{
				plan_id: planId,
				name: v1Name,
				items: [messagesItem(100)],
			},
		],
	});
	await autumn.catalogV2.update({
		plans: [
			{
				plan_id: planId,
				version: 2,
				name: v2Name,
				items: [messagesItem(200)],
			},
		],
	});
};

test.concurrent(
	`${chalk.yellowBright("catalogV2 mixed: new_version + all_versions + pinned v1 + create in one call")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planA = uniqueTestId("cv2_mix_a");
		const planB = uniqueTestId("cv2_mix_b");
		const planC = uniqueTestId("cv2_mix_c");
		const planD = uniqueTestId("cv2_mix_d");
		const planIds = [planA, planB, planC, planD];
		await deleteDbPlans({ ctx, planIds });
		try {
			await seedTwoVersions({
				autumn: autumnV2_3,
				planId: planA,
				v1Name: "A V1",
				v2Name: "A V2",
			});
			await seedTwoVersions({
				autumn: autumnV2_3,
				planId: planB,
				v1Name: "B V1",
				v2Name: "B V2",
			});
			await seedTwoVersions({
				autumn: autumnV2_3,
				planId: planC,
				v1Name: "C V1",
				v2Name: "C V2",
			});

			const params = {
				plans: [
					{
						plan_id: planA,
						name: "A V3",
						versioning: "new_version" as const,
					},
					{
						plan_id: planB,
						name: "B All",
						versioning: "all_versions" as const,
					},
					{
						plan_id: planC,
						version: 1,
						name: "C V1 Edited",
					},
					{ plan_id: planD, name: "D New" },
				],
			};

			const response = await autumnV2_3.catalogV2.update(params);
			expectCatalogResultsCorrect({
				response,
				plans: [
					{ id: planA, action: "create" },
					{ id: planB, action: "update" },
					{ id: planC, action: "update" },
					{ id: planD, action: "create" },
				],
			});

			await expectPlanVersionsCorrect({
				ctx,
				planId: planA,
				versions: [1, 2, 3],
			});
			await expectDbPlansCorrect({
				ctx,
				expected: [
					{ id: planA, version: 1, name: "A V1" },
					{ id: planA, version: 2, name: "A V2" },
					{ id: planA, version: 3, name: "A V3" },
				],
			});

			await expectPlanVersionsCorrect({
				ctx,
				planId: planB,
				versions: [1, 2],
			});
			await expectDbPlansCorrect({
				ctx,
				expected: [
					{ id: planB, version: 1, name: "B All" },
					{ id: planB, version: 2, name: "B All" },
				],
			});

			await expectPlanVersionsCorrect({
				ctx,
				planId: planC,
				versions: [1, 2],
			});
			await expectDbPlansCorrect({
				ctx,
				expected: [
					{ id: planC, version: 1, name: "C V1 Edited" },
					{ id: planC, version: 2, name: "C V2" },
				],
			});

			await expectPlanVersionsCorrect({
				ctx,
				planId: planD,
				versions: [1],
			});
			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [{ id: planD, version: 1, name: "D New" }],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 mixed: preview versioning blocks match each strategy")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planA = uniqueTestId("cv2_mixp_a");
		const planB = uniqueTestId("cv2_mixp_b");
		const planC = uniqueTestId("cv2_mixp_c");
		const planD = uniqueTestId("cv2_mixp_d");
		const planIds = [planA, planB, planC, planD];
		await deleteDbPlans({ ctx, planIds });
		try {
			await seedTwoVersions({
				autumn: autumnV2_3,
				planId: planA,
				v1Name: "A V1",
				v2Name: "A V2",
			});
			await seedTwoVersions({
				autumn: autumnV2_3,
				planId: planB,
				v1Name: "B V1",
				v2Name: "B V2",
			});
			await seedTwoVersions({
				autumn: autumnV2_3,
				planId: planC,
				v1Name: "C V1",
				v2Name: "C V2",
			});

			const preview = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [
						{
							plan_id: planA,
							name: "A V3",
							versioning: "new_version",
						},
						{
							plan_id: planB,
							name: "B All",
							versioning: "all_versions",
						},
						{
							plan_id: planC,
							version: 1,
							name: "C V1 Edited",
						},
						{ plan_id: planD, name: "D New" },
					],
				}),
			);

			expectPlanPreviewRowCorrect({
				preview,
				expected: {
					planId: planA,
					action: "create",
					versioning: {
						current_version: 2,
						new_version: 3,
						resolved: "new_version",
						options: ["all_versions"],
					},
				},
			});
			expectPlanPreviewRowsCorrect({
				preview,
				expected: [
					{
						planId: planB,
						currentVersion: 1,
						action: "update",
						versioning: {
							current_version: 1,
							new_version: null,
							resolved: "all_versions",
							options: ["all_versions"],
						},
					},
					{
						planId: planB,
						currentVersion: 2,
						action: "update",
						versioning: {
							current_version: 2,
							new_version: null,
							resolved: "all_versions",
							options: ["all_versions"],
						},
					},
				],
			});
			expectPlanPreviewRowCorrect({
				preview,
				expected: {
					planId: planC,
					currentVersion: 1,
					action: "update",
					versioning: {
						current_version: 1,
						new_version: null,
						resolved: "existing",
						options: ["all_versions"],
					},
				},
			});
			expectPlanPreviewRowCorrect({
				preview,
				expected: {
					planId: planD,
					action: "create",
					versioning: null,
				},
			});
		} finally {
			await deleteDbPlans({ ctx, planIds });
		}
	},
);
