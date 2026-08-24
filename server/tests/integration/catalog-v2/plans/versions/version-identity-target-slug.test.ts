/**
 * catalogV2 version identity — target by version_slug (unit 3).
 *
 * Contract:
 *   version_slug of a non-active row edits that row only (siblings untouched)
 *   omit both version keys still edits the active row
 *   two slugs same plan → both rows; no sibling auto-propagate; no leak to another plan
 *   archived slug pin matches numeric pin (row is editable)
 *   slug pin does not move active / is_default
 *   preview sibling_versions lists others unselected; all_versions stays in options
 */

import { test } from "bun:test";
import { ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import {
	deleteDbPlans,
	expectDbPlansCorrect,
} from "../utils/expectCatalogPlans.js";
import {
	expectVersionIdentityCorrect,
	forceActiveVersion,
} from "../utils/expectVersionIdentity.js";
import {
	expectPlanPreviewRowCorrect,
	parsePlanPreview,
} from "../preview/utils/expectPlanPreview.js";

const messagesItem = (included: number) => ({
	feature_id: TestFeature.Messages,
	included,
	reset: { interval: ResetInterval.Month },
});

const seedV1AndV2 = async ({
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
				active: true,
				name: "V2",
				items: [messagesItem(200)],
			},
		],
	});
};

test.concurrent(
	`${chalk.yellowBright("version identity target: slug pin edits v1 only; siblings unselected")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_vid_tpin");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await seedV1AndV2({ autumn: autumnV2_3, planId });

			const preview = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [
						{
							plan_id: planId,
							version_slug: "v1",
							name: "V1 Pinned",
							items: [messagesItem(150)],
						},
					],
				}),
			);
			expectPlanPreviewRowCorrect({
				preview,
				expected: {
					planId,
					action: "update",
					versionSlug: "v1",
					newVersionSlug: null,
					active: false,
					versioningOptions: ["existing", "all_versions"],
					siblingVersions: [
						{ version: 2, hasPlanChange: false },
					],
				},
			});

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						version_slug: "v1",
						name: "V1 Pinned",
						items: [messagesItem(150)],
					},
				],
			});

			await expectDbPlansCorrect({
				ctx,
				expected: [
					{
						id: planId,
						version: 1,
						name: "V1 Pinned",
						allowances: { [TestFeature.Messages]: 150 },
					},
					{
						id: planId,
						version: 2,
						name: "V2",
						allowances: { [TestFeature.Messages]: 200 },
					},
				],
			});
			await expectVersionIdentityCorrect({
				ctx,
				planId,
				version: 1,
				versionSlug: "v1",
				active: false,
				isDefault: false,
			});
			await expectVersionIdentityCorrect({
				ctx,
				planId,
				version: 2,
				versionSlug: "v2",
				active: true,
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("version identity target: omit both keys still edits the active row")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_vid_tomit");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await seedV1AndV2({ autumn: autumnV2_3, planId });
			await forceActiveVersion({ ctx, planId, version: 1 });

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "V1 via omit",
						items: [messagesItem(175)],
					},
				],
			});

			await expectDbPlansCorrect({
				ctx,
				expected: [
					{
						id: planId,
						version: 1,
						name: "V1 via omit",
						allowances: { [TestFeature.Messages]: 175 },
					},
					{
						id: planId,
						version: 2,
						name: "V2",
						allowances: { [TestFeature.Messages]: 200 },
					},
				],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("version identity target: two slugs update both rows; no leak to another plan")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planA = uniqueTestId("cv2_vid_ta");
		const planB = uniqueTestId("cv2_vid_tb");
		await deleteDbPlans({ ctx, planIds: [planA, planB] });
		try {
			await seedV1AndV2({ autumn: autumnV2_3, planId: planA });
			await seedV1AndV2({ autumn: autumnV2_3, planId: planB });

			const preview = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [
						{ plan_id: planA, version_slug: "v1", name: "A1" },
						{ plan_id: planA, version_slug: "v2", name: "A2" },
						{ plan_id: planB, version_slug: "v1", name: "B1 only" },
					],
				}),
			);
			expectPlanPreviewRowCorrect({
				preview,
				expected: {
					planId: planA,
					currentVersion: 1,
					action: "update",
					siblingVersions: null,
				},
			});
			expectPlanPreviewRowCorrect({
				preview,
				expected: {
					planId: planA,
					currentVersion: 2,
					action: "update",
					siblingVersions: null,
				},
			});

			await autumnV2_3.catalogV2.update({
				plans: [
					{ plan_id: planA, version_slug: "v1", name: "A1" },
					{ plan_id: planA, version_slug: "v2", name: "A2" },
					{ plan_id: planB, version_slug: "v1", name: "B1 only" },
				],
			});

			await expectDbPlansCorrect({
				ctx,
				expected: [
					{ id: planA, version: 1, name: "A1" },
					{ id: planA, version: 2, name: "A2" },
					{ id: planB, version: 1, name: "B1 only" },
					{ id: planB, version: 2, name: "V2" },
				],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planA, planB] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("version identity target: archived slug pin still edits that row")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_vid_tarch");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await seedV1AndV2({ autumn: autumnV2_3, planId });
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, version: 1, archived: true }],
			});

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						version_slug: "v1",
						name: "Archived Edited",
					},
				],
			});

			await expectDbPlansCorrect({
				ctx,
				expected: [
					{
						id: planId,
						version: 1,
						name: "Archived Edited",
						archived: true,
					},
					{ id: planId, version: 2, name: "V2", archived: false },
				],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);
