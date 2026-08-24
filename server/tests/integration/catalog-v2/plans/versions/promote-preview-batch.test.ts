/**
 * catalogV2 preview — promotion_details across batch, custom slug, paid promote.
 *
 * Contract:
 *   two plans promoting in one call → each row has its own promotion_details
 *   previous_active_version_slug is the current pointer's slug (not v{n} fallback)
 *   paid-over-free promote still includes promotion_details (pointer moves)
 */

import { test } from "bun:test";
import { BillingInterval, ResetInterval } from "@autumn/shared";
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
		plans: [{ plan_id: planId, name: "V1", items: [messagesItem(100)] }],
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
	`${chalk.yellowBright("catalogV2 promote preview: two plans in one batch each carry promotion_details")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planA = uniqueTestId("cv2_prm_pb_a");
		const planB = uniqueTestId("cv2_prm_pb_b");
		await deleteDbPlans({ ctx, planIds: [planA, planB] });
		try {
			await seedV1AndDraftV2({ autumn: autumnV2_3, planId: planA });
			await seedV1AndDraftV2({ autumn: autumnV2_3, planId: planB });

			const preview = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [
						{ plan_id: planA, version_slug: "v2", active: true },
						{ plan_id: planB, version_slug: "v2", active: true },
					],
				}),
			);

			expectPlanPreviewRowCorrect({
				preview,
				expected: {
					planId: planA,
					active: true,
					promotionDetails: { previous_active_version_slug: "v1" },
				},
			});
			expectPlanPreviewRowCorrect({
				preview,
				expected: {
					planId: planB,
					active: true,
					promotionDetails: { previous_active_version_slug: "v1" },
				},
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planA, planB] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 promote preview: previous_active_version_slug is the custom pointer slug")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_prm_pb_slug");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Summer",
						new_version_slug: "summer",
						items: [messagesItem(100)],
					},
				],
			});
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						versioning: "new_version",
						name: "V2 Draft",
						items: [messagesItem(200)],
					},
				],
			});

			const preview = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [{ plan_id: planId, version_slug: "v2", active: true }],
				}),
			);

			expectPlanPreviewRowCorrect({
				preview,
				expected: {
					planId,
					versionSlug: "v2",
					active: true,
					promotionDetails: { previous_active_version_slug: "summer" },
					siblingVersions: [{ version: 1, active: false }],
				},
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 promote preview: paid-over-free still includes promotion_details")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_prm_pb_paid");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Free V1",
						auto_enable: true,
						items: [messagesItem(100)],
					},
				],
			});
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						versioning: "new_version",
						name: "Paid Draft",
						create_in_stripe: false,
						price: { amount: 20, interval: BillingInterval.Month },
						items: [messagesItem(200)],
					},
				],
			});

			const preview = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [{ plan_id: planId, version_slug: "v2", active: true }],
				}),
			);

			expectPlanPreviewRowCorrect({
				preview,
				expected: {
					planId,
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
