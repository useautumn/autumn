/**
 * catalogV2 promote — same-call pointer guards.
 *
 * Contract:
 *   Two `active: true` entries for the same plan_id → 400
 *   Two different plans both promoting in one call → both succeed
 *   `versioning: "all_versions"` + `active: true` → 400 (unique_active)
 */

import { test } from "bun:test";
import { ErrCode, ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import { deleteDbPlans } from "../utils/expectCatalogPlans.js";
import { expectVersionIdentityCorrect } from "../utils/expectVersionIdentity.js";

const messagesItem = (included: number) => ({
	feature_id: TestFeature.Messages,
	included,
	reset: { interval: ResetInterval.Month },
});

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
	`${chalk.yellowBright("catalogV2 promote: two active:true on the same plan_id → 400")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_prm_2act");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await seedV1ThenLiveV2({ autumn: autumnV2_3, planId });

			await expectAutumnError({
				errCode: ErrCode.InvalidRequest,
				errMessage: "Cannot set active on two versions of the same plan",
				func: () =>
					autumnV2_3.catalogV2.update({
						plans: [
							{ plan_id: planId, version_slug: "v1", active: true },
							{ plan_id: planId, version_slug: "v2", active: true },
						],
					}),
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 promote: two different plans promoting in one batch both succeed")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planA = uniqueTestId("cv2_prm_ba");
		const planB = uniqueTestId("cv2_prm_bb");
		await deleteDbPlans({ ctx, planIds: [planA, planB] });
		try {
			await seedV1AndDraftV2({ autumn: autumnV2_3, planId: planA });
			await seedV1AndDraftV2({ autumn: autumnV2_3, planId: planB });

			await autumnV2_3.catalogV2.update({
				plans: [
					{ plan_id: planA, version_slug: "v2", active: true },
					{ plan_id: planB, version_slug: "v2", active: true },
				],
			});

			await expectVersionIdentityCorrect({
				ctx,
				planId: planA,
				version: 1,
				active: false,
			});
			await expectVersionIdentityCorrect({
				ctx,
				planId: planA,
				version: 2,
				active: true,
			});
			await expectVersionIdentityCorrect({
				ctx,
				planId: planB,
				version: 1,
				active: false,
			});
			await expectVersionIdentityCorrect({
				ctx,
				planId: planB,
				version: 2,
				active: true,
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planA, planB] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 promote: all_versions + active:true → 400")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_prm_all");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await seedV1ThenLiveV2({ autumn: autumnV2_3, planId });

			await expectAutumnError({
				errCode: ErrCode.InvalidRequest,
				errMessage: "Cannot set active on all_versions",
				func: () =>
					autumnV2_3.catalogV2.update({
						plans: [
							{
								plan_id: planId,
								versioning: "all_versions",
								active: true,
							},
						],
					}),
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);
