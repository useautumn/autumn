/**
 * catalogV2 preview — promotion_details present vs omitted.
 *
 * Contract:
 *   already-active + active:true no-op → promotion_details omitted
 *   draft mint without active, and first create → omitted
 *   mint + active that takes an existing pointer → present
 *   rename + promote returns both rename fields and promotion_details
 */

import { test } from "bun:test";
import { ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import { deleteDbPlans } from "../utils/expectCatalogPlans.js";
import {
	expectPlanPreviewRowCorrect,
	parsePlanPreview,
} from "../preview/utils/expectPlanPreview.js";

const messagesItem = (included: number) => ({
	feature_id: TestFeature.Messages,
	included,
	reset: { interval: ResetInterval.Month },
});

const seedV1AndDraftV2 = async ({
	autumn,
	planId,
}: {
	autumn: Awaited<ReturnType<typeof initScenario>>["autumnV2_3"];
	planId: string;
}) => {
	await autumn.catalogV2.update({
		plans: [
			{
				plan_id: planId,
				name: "V1",
				auto_enable: true,
				items: [messagesItem(100)],
			},
		],
	});
	await autumn.catalogV2.update({
		plans: [
			{
				plan_id: planId,
				versioning: "new_version",
				name: "V2 Draft",
				items: [messagesItem(200)],
			},
		],
	});
};

test.concurrent(
	`${chalk.yellowBright("catalogV2 promote preview: already-active no-op omits promotion_details")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_prm_pd_noop");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await seedV1AndDraftV2({ autumn: autumnV2_3, planId });

			const preview = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [{ plan_id: planId, version_slug: "v1", active: true }],
				}),
			);

			expectPlanPreviewRowCorrect({
				preview,
				expected: {
					planId,
					versionSlug: "v1",
					active: true,
					promotionDetails: undefined,
					siblingVersions: [{ version: 2, active: false }],
				},
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 promote preview: draft mint and first create omit promotion_details")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const draftId = uniqueTestId("cv2_prm_pd_drf");
		const firstId = uniqueTestId("cv2_prm_pd_1st");
		await deleteDbPlans({ ctx, planIds: [draftId, firstId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: draftId,
						name: "V1",
						auto_enable: true,
						items: [messagesItem(100)],
					},
				],
			});

			const preview = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [
						{
							plan_id: draftId,
							versioning: "new_version",
							name: "Draft",
							items: [messagesItem(200)],
						},
						{
							plan_id: firstId,
							name: "First",
							items: [messagesItem(50)],
						},
					],
				}),
			);

			expectPlanPreviewRowCorrect({
				preview,
				expected: {
					planId: draftId,
					action: "update",
					active: false,
					promotionDetails: undefined,
				},
			});
			expectPlanPreviewRowCorrect({
				preview,
				expected: {
					planId: firstId,
					action: "create",
					active: true,
					promotionDetails: undefined,
				},
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [draftId, firstId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 promote preview: mint+active taking the pointer includes promotion_details")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_prm_pd_mnt");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "V1",
						auto_enable: true,
						items: [messagesItem(100)],
					},
				],
			});

			const preview = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [
						{
							plan_id: planId,
							versioning: "new_version",
							active: true,
							name: "V2",
							items: [messagesItem(200)],
						},
					],
				}),
			);

			expectPlanPreviewRowCorrect({
				preview,
				expected: {
					planId,
					action: "update",
					versionSlug: "v2",
					active: true,
					promotionDetails: { previous_active_version_slug: "v1" },
					siblingVersions: [{ version: 1, active: false }],
				},
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 promote preview: rename+promote returns both rename fields and promotion_details")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_prm_pd_ren");
		const renamedId = uniqueTestId("cv2_prm_pd_ren2");
		await deleteDbPlans({ ctx, planIds: [planId, renamedId] });
		try {
			await seedV1AndDraftV2({ autumn: autumnV2_3, planId });

			const preview = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [
						{
							plan_id: planId,
							version_slug: "v2",
							new_plan_id: renamedId,
							new_version_slug: "summer",
							active: true,
						},
					],
				}),
			);

			expectPlanPreviewRowCorrect({
				preview,
				expected: {
					planId,
					action: "update",
					versionSlug: "v2",
					newPlanId: renamedId,
					newVersionSlug: "summer",
					active: true,
					promotionDetails: { previous_active_version_slug: "v1" },
					siblingVersions: [{ version: 1, active: false }],
				},
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId, renamedId] });
		}
	},
);
