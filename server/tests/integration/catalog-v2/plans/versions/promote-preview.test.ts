/**
 * catalogV2 promote — preview identity + no mint + idempotent.
 *
 * Contract:
 *   preview: promoted row active:true; sibling (old pointer) active:false
 *   preview back-promote: v1 active:true while v2 is live; sibling v2 inactive
 *   promote does not mint — still exactly versions [1, 2]
 *   active:true on the already-active row is a no-op (v1 draft case and live v2)
 */

import { test } from "bun:test";
import { ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import { deleteDbPlans, expectPlanVersionsCorrect } from "../utils/expectCatalogPlans.js";
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
	`${chalk.yellowBright("catalogV2 promote: preview shows v2 active and sibling v1 inactive")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_prm_prev");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await seedV1AndDraftV2({ autumn: autumnV2_3, planId });

			const preview = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [{ plan_id: planId, version_slug: "v2", active: true }],
				}),
			);

			expectPlanPreviewRowCorrect({
				preview,
				expected: {
					planId,
					action: "update",
					versionSlug: "v2",
					active: true,
					siblingVersions: [{ version: 1, active: false }],
				},
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 promote: does not mint a new version number")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_prm_nomint");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await seedV1AndDraftV2({ autumn: autumnV2_3, planId });

			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, version_slug: "v2", active: true }],
			});

			await expectPlanVersionsCorrect({ ctx, planId, versions: [1, 2] });
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
	`${chalk.yellowBright("catalogV2 promote: active:true on the current pointer is a no-op")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_prm_noop");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await seedV1AndDraftV2({ autumn: autumnV2_3, planId });

			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, version_slug: "v1", active: true }],
			});

			await expectPlanVersionsCorrect({ ctx, planId, versions: [1, 2] });
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

const seedV1ThenLiveV2 = async ({
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
				active: true,
				name: "V2",
				items: [messagesItem(200)],
			},
		],
	});
};

test.concurrent(
	`${chalk.yellowBright("catalogV2 promote: preview back-promote shows v1 active and sibling v2 inactive")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_prm_bprev");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await seedV1ThenLiveV2({ autumn: autumnV2_3, planId });

			const preview = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [{ plan_id: planId, version_slug: "v1", active: true }],
				}),
			);

			expectPlanPreviewRowCorrect({
				preview,
				expected: {
					planId,
					action: "update",
					versionSlug: "v1",
					active: true,
					siblingVersions: [{ version: 2, active: false }],
				},
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 promote: active:true on already-active v2 is a no-op")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_prm_noop2");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await seedV1ThenLiveV2({ autumn: autumnV2_3, planId });

			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, version_slug: "v2", active: true }],
			});

			await expectPlanVersionsCorrect({ ctx, planId, versions: [1, 2] });
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
				versionSlug: "v2",
				active: true,
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);
