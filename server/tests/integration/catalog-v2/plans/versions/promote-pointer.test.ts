/**
 * catalogV2 promote — pointer flip, unique_active_product, active:false reject.
 *
 * Contract:
 *   promote v1 while v2 is active → v1 takes the pointer; exactly one active
 *   is_default does not jump onto a historical version (v1 < latest v2)
 *   active:false on the current pointer with no successor → 400
 *   active:false is allowed when another entry in the same call takes the pointer
 *   promote + new_plan_id in one call → previously active row (old id) still demotes
 *   numeric `version: 1` + `active: true` promotes the same as version_slug
 */

import { expect, test } from "bun:test";
import { ErrCode, ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import { deleteDbPlans } from "../utils/expectCatalogPlans.js";
import {
	expectExactlyOneActiveVersion,
	expectVersionIdentityCorrect,
} from "../utils/expectVersionIdentity.js";

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

test.concurrent(
	`${chalk.yellowBright("catalogV2 promote: v1 while v2 is active — one pointer, default stays on latest")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_prm_back");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await seedV1ThenLiveV2({ autumn: autumnV2_3, planId });

			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, version_slug: "v1", active: true }],
			});

			const active = await expectExactlyOneActiveVersion({ ctx, planId });
			expect(active.version).toBe(1);
			await expectVersionIdentityCorrect({
				ctx,
				planId,
				version: 1,
				versionSlug: "v1",
				active: true,
				isDefault: false,
			});
			await expectVersionIdentityCorrect({
				ctx,
				planId,
				version: 2,
				versionSlug: "v2",
				active: false,
				isDefault: true,
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 promote: active:false on the pointer with no successor → 400")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_prm_off");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await seedV1ThenLiveV2({ autumn: autumnV2_3, planId });

			await expectAutumnError({
				errCode: ErrCode.InvalidRequest,
				errMessage: "Cannot set active to false",
				func: () =>
					autumnV2_3.catalogV2.update({
						plans: [{ plan_id: planId, version_slug: "v2", active: false }],
					}),
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 promote: taker renamed in the same call still demotes the old pointer")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_prm_ren_a");
		const renamedId = uniqueTestId("cv2_prm_ren_b");
		await deleteDbPlans({ ctx, planIds: [planId, renamedId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "V1",
						items: [messagesItem(100)],
					},
				],
			});
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						versioning: "new_version",
						name: "V2",
						items: [messagesItem(200)],
					},
				],
			});

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						version_slug: "v2",
						new_plan_id: renamedId,
						active: true,
					},
				],
			});

			const active = await expectExactlyOneActiveVersion({
				ctx,
				planId: renamedId,
			});
			expect(active.version).toBe(2);
			await expectVersionIdentityCorrect({
				ctx,
				planId: renamedId,
				version: 2,
				versionSlug: "v2",
				active: true,
			});
			// The row it replaces still carries the old plan id — demote it anyway.
			await expectVersionIdentityCorrect({
				ctx,
				planId,
				version: 1,
				active: false,
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId, renamedId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 promote: active:false is ok when another entry takes the pointer")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_prm_swap");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await seedV1ThenLiveV2({ autumn: autumnV2_3, planId });

			await autumnV2_3.catalogV2.update({
				plans: [
					{ plan_id: planId, version_slug: "v2", active: false },
					{ plan_id: planId, version_slug: "v1", active: true },
				],
			});

			await expectExactlyOneActiveVersion({ ctx, planId });
			await expectVersionIdentityCorrect({
				ctx,
				planId,
				version: 1,
				active: true,
			});
			await expectVersionIdentityCorrect({
				ctx,
				planId,
				version: 2,
				active: false,
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 promote: numeric version: 1 takes the pointer from live v2")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_prm_num");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await seedV1ThenLiveV2({ autumn: autumnV2_3, planId });

			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, version: 1, active: true }],
			});

			const active = await expectExactlyOneActiveVersion({ ctx, planId });
			expect(active.version).toBe(1);
			await expectVersionIdentityCorrect({
				ctx,
				planId,
				version: 1,
				active: true,
			});
			await expectVersionIdentityCorrect({
				ctx,
				planId,
				version: 2,
				active: false,
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);
