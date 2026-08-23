/**
 * catalogV2 version identity — mint (units 1–2).
 *
 * Contract:
 *   new_version omit active → draft (v2 inactive, v1 keeps pointer + is_default)
 *   new_version active:true → lockstep (v2 takes pointer + is_default)
 *   new_version_slug stamps the minted row; omit → v{n}
 *   first create new_version_slug stamps v1
 *   preview: version_slug / active always; new_* only when that field changes
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

const seedDefaultV1 = async ({
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
};

test.concurrent(
	`${chalk.yellowBright("version identity mint: new_version omit active leaves a draft")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_vid_draft");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await seedDefaultV1({ autumn: autumnV2_3, planId });
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

			await expectVersionIdentityCorrect({
				ctx,
				planId,
				version: 1,
				versionSlug: "v1",
				active: true,
				isDefault: true,
			});
			await expectVersionIdentityCorrect({
				ctx,
				planId,
				version: 2,
				versionSlug: "v2",
				active: false,
				isDefault: false,
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("version identity mint: new_version active:true takes the pointer")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_vid_lock");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await seedDefaultV1({ autumn: autumnV2_3, planId });
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						versioning: "new_version",
						active: true,
						name: "V2 Live",
						items: [messagesItem(200)],
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
				isDefault: true,
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("version identity mint: new_version_slug stamps the minted row")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_vid_slug");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await seedDefaultV1({ autumn: autumnV2_3, planId });
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						versioning: "new_version",
						new_version_slug: "summer",
						name: "Summer",
					},
				],
			});

			await expectVersionIdentityCorrect({
				ctx,
				planId,
				version: 1,
				versionSlug: "v1",
				active: true,
			});
			await expectVersionIdentityCorrect({
				ctx,
				planId,
				version: 2,
				versionSlug: "summer",
				active: false,
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("version identity mint: first create new_version_slug stamps v1")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_vid_v1slug");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Launch",
						new_version_slug: "launch",
						items: [messagesItem(50)],
					},
				],
			});

			await expectVersionIdentityCorrect({
				ctx,
				planId,
				version: 1,
				versionSlug: "launch",
				active: true,
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("version identity mint: preview draft vs stamped+active")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const draftId = uniqueTestId("cv2_vid_pvd");
		const liveId = uniqueTestId("cv2_vid_pvl");
		const renameId = uniqueTestId("cv2_vid_pvr");
		const renamedId = `${renameId}_2`;
		await deleteDbPlans({
			ctx,
			planIds: [draftId, liveId, renameId, renamedId],
		});
		try {
			await seedDefaultV1({ autumn: autumnV2_3, planId: draftId });
			await seedDefaultV1({ autumn: autumnV2_3, planId: liveId });
			await seedDefaultV1({ autumn: autumnV2_3, planId: renameId });

			const preview = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [
						{
							plan_id: draftId,
							versioning: "new_version",
							name: "Draft",
						},
						{
							plan_id: liveId,
							versioning: "new_version",
							active: true,
							new_version_slug: "summer",
							name: "Summer",
						},
						{
							plan_id: renameId,
							new_plan_id: renamedId,
							name: "Renamed",
						},
					],
				}),
			);

			expectPlanPreviewRowCorrect({
				preview,
				expected: {
					planId: draftId,
					action: "create",
					versionSlug: "v2",
					newVersionSlug: null,
					newPlanId: null,
					active: false,
				},
			});
			expectPlanPreviewRowCorrect({
				preview,
				expected: {
					planId: liveId,
					action: "create",
					versionSlug: "v2",
					newVersionSlug: "summer",
					newPlanId: null,
					active: true,
				},
			});
			expectPlanPreviewRowCorrect({
				preview,
				expected: {
					planId: renameId,
					action: "update",
					versionSlug: "v1",
					newVersionSlug: null,
					newPlanId: renamedId,
					active: true,
				},
			});
		} finally {
			await deleteDbPlans({
				ctx,
				planIds: [draftId, liveId, renameId, renamedId],
			});
		}
	},
);
