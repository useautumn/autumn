/**
 * Version identity — catalogV2.update omit-version vs sequence (r3–r5).
 *
 * Contract under test:
 *   r3  v1 forced active → omit catalogV2.update patches v1
 *   r4  v1 forced active → new_version clones v1 into max+1
 *   r5  v1 forced active → explicit version: 2 still edits v2
 *   Lockstep (v2 active) omit-update still patches v2.
 */

import { expect, test } from "bun:test";
import { ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { invalidateProductsCache } from "@/external/redis/actions/productsCache/productsCache.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import {
	deleteDbPlans,
	expectDbPlansCorrect,
	expectPlanVersionsCorrect,
} from "../utils/expectCatalogPlans.js";

type TestContext = AutumnContext;

const messagesItem = (included: number) => ({
	feature_id: TestFeature.Messages,
	included,
	reset: { interval: ResetInterval.Month },
});

const forceActiveVersion = async ({
	ctx,
	planId,
	version,
}: {
	ctx: TestContext;
	planId: string;
	version: number;
}) => {
	const versions = await ProductService.listFull({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		inIds: [planId],
		returnAll: true,
		skipCache: true,
	});
	for (const product of versions) {
		if (product.active && product.version !== version) {
			await ProductService.updateByInternalId({
				db: ctx.db,
				internalId: product.internal_id,
				update: { active: false },
			});
		}
	}
	const target = versions.find((product) => product.version === version);
	expect(target).toBeDefined();
	await ProductService.updateByInternalId({
		db: ctx.db,
		internalId: target!.internal_id,
		update: { active: true },
	});
	await invalidateProductsCache({ orgId: ctx.org.id, env: ctx.env });
};

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
				name: "V2",
				items: [messagesItem(200)],
			},
		],
	});
};

test.concurrent(
	`${chalk.yellowBright("version identity update: omit version with v2 active edits v2")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_vid_lockstep");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await seedV1AndV2({ autumn: autumnV2_3, planId });

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "V2 Edited",
						items: [messagesItem(300)],
					},
				],
			});

			await expectDbPlansCorrect({
				ctx,
				expected: [
					{
						id: planId,
						version: 1,
						name: "V1",
						allowances: { [TestFeature.Messages]: 100 },
					},
					{
						id: planId,
						version: 2,
						name: "V2 Edited",
						allowances: { [TestFeature.Messages]: 300 },
					},
				],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("version identity update: omit version with v1 forced active edits v1")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_vid_active");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await seedV1AndV2({ autumn: autumnV2_3, planId });
			await forceActiveVersion({ ctx, planId, version: 1 });

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "V1 Edited",
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
						name: "V1 Edited",
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
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("version identity update: new_version clones active v1 into max+1")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_vid_mint");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await seedV1AndV2({ autumn: autumnV2_3, planId });
			await forceActiveVersion({ ctx, planId, version: 1 });

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "V3",
						versioning: "new_version",
					},
				],
			});

			await expectPlanVersionsCorrect({
				ctx,
				planId,
				versions: [1, 2, 3],
			});
			await expectDbPlansCorrect({
				ctx,
				expected: [
					{
						id: planId,
						version: 1,
						name: "V1",
						allowances: { [TestFeature.Messages]: 100 },
					},
					{
						id: planId,
						version: 2,
						name: "V2",
						allowances: { [TestFeature.Messages]: 200 },
					},
					{
						id: planId,
						version: 3,
						name: "V3",
						allowances: { [TestFeature.Messages]: 100 },
					},
				],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("version identity update: explicit version 2 still edits v2 when v1 is active")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_vid_pin");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await seedV1AndV2({ autumn: autumnV2_3, planId });
			await forceActiveVersion({ ctx, planId, version: 1 });

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						version: 2,
						name: "V2 Pinned",
						items: [messagesItem(250)],
					},
				],
			});

			await expectDbPlansCorrect({
				ctx,
				expected: [
					{
						id: planId,
						version: 1,
						name: "V1",
						allowances: { [TestFeature.Messages]: 100 },
					},
					{
						id: planId,
						version: 2,
						name: "V2 Pinned",
						allowances: { [TestFeature.Messages]: 250 },
					},
				],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);
