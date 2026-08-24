/**
 * catalogV2 version identity — new_version_slug rename on an existing row (unit 4).
 *
 * Contract:
 *   omit-target + new_version_slug renames the active row
 *   slug-target + new_version_slug renames that non-active row; active slug unchanged
 *   preview: version_slug = current, new_version_slug only when it changes
 *   rename to the slug this row already has is a no-op
 */

import { test } from "bun:test";
import { ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import { deleteDbPlans } from "../utils/expectCatalogPlans.js";
import { expectVersionIdentityCorrect } from "../utils/expectVersionIdentity.js";
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
	`${chalk.yellowBright("version identity rename: omit-target renames the active row")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_vid_ract");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await seedV1AndV2({ autumn: autumnV2_3, planId });

			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, new_version_slug: "summer" }],
			});

			await expectVersionIdentityCorrect({
				ctx,
				planId,
				version: 1,
				versionSlug: "v1",
				active: false,
			});
			await expectVersionIdentityCorrect({
				ctx,
				planId,
				version: 2,
				versionSlug: "summer",
				active: true,
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("version identity rename: slug-target renames the non-active row")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_vid_rpin");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await seedV1AndV2({ autumn: autumnV2_3, planId });

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						version_slug: "v1",
						new_version_slug: "winter",
					},
				],
			});

			await expectVersionIdentityCorrect({
				ctx,
				planId,
				version: 1,
				versionSlug: "winter",
				active: false,
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
	`${chalk.yellowBright("version identity rename: preview trio + same-slug no-op")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const renameId = uniqueTestId("cv2_vid_rpv");
		const noopId = uniqueTestId("cv2_vid_rnp");
		await deleteDbPlans({ ctx, planIds: [renameId, noopId] });
		try {
			await seedV1AndV2({ autumn: autumnV2_3, planId: renameId });
			await seedV1AndV2({ autumn: autumnV2_3, planId: noopId });

			const preview = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [
						{
							plan_id: renameId,
							version_slug: "v1",
							new_version_slug: "winter",
						},
						{ plan_id: noopId, new_version_slug: "v2" },
					],
				}),
			);
			expectPlanPreviewRowCorrect({
				preview,
				expected: {
					planId: renameId,
					action: "update",
					versionSlug: "v1",
					newVersionSlug: "winter",
					active: false,
				},
			});
			expectPlanPreviewRowCorrect({
				preview,
				expected: {
					planId: noopId,
					action: "none",
					versionSlug: "v2",
					newVersionSlug: null,
					active: true,
				},
			});

			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: noopId, new_version_slug: "v2" }],
			});
			await expectVersionIdentityCorrect({
				ctx,
				planId: noopId,
				version: 2,
				versionSlug: "v2",
				active: true,
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [renameId, noopId] });
		}
	},
);
