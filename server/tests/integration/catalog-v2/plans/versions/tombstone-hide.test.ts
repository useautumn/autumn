/**
 * Unit 1 — catalog reads hide tombstones; mint max still sees them.
 *
 * Contract:
 *   get / listFull / catalog.get omit a deleted_at row
 *   listFull({ includeDeleted }) still returns it (occupancy)
 *   new_version after tombstoning v2 mints v3, not a colliding v2
 */

import { expect, test } from "bun:test";
import { ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { ProductService } from "@/internal/products/ProductService.js";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import { deleteDbPlans } from "../utils/expectCatalogPlans.js";
import { expectVersionIdentityCorrect } from "../utils/expectVersionIdentity.js";
import { stampProductTombstone } from "../utils/stampProductTombstone.js";

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
	`${chalk.yellowBright("tombstone hide: catalog reads omit a deleted draft; occupancy still sees it")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_tombstone_hide");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await seedV1AndDraftV2({ autumn: autumnV2_3, planId });
			const tombstoned = await stampProductTombstone({
				ctx,
				planId,
				version: 2,
			});

			const pinned = await ProductService.get({
				db: ctx.db,
				id: planId,
				orgId: ctx.org.id,
				env: ctx.env,
				version: 2,
			});
			expect(pinned).toBeUndefined();

			const live = await ProductService.listFull({
				db: ctx.db,
				orgId: ctx.org.id,
				env: ctx.env,
				inIds: [planId],
				returnAll: true,
				skipCache: true,
			});
			expect(live.map((product) => product.version)).toEqual([1]);

			const occupancy = await ProductService.listFull({
				db: ctx.db,
				orgId: ctx.org.id,
				env: ctx.env,
				inIds: [planId],
				returnAll: true,
				includeDeleted: true,
				skipCache: true,
			});
			const occupancyV2 = occupancy.find((product) => product.version === 2);
			expect(occupancyV2?.deleted_at).toBeTruthy();
			expect(occupancyV2?.version_slug).toBeNull();
			expect(occupancyV2?.previous_version_slug).toBe("v2");
			expect(occupancyV2?.internal_id).toBe(tombstoned.internal_id);

			const catalog = await autumnV2_3.catalogV2.get({
				include_archived: true,
			});
			expect(catalog.plans.find((plan) => plan.id === planId)?.version).toBe(1);

			await expectVersionIdentityCorrect({
				ctx,
				planId,
				version: 1,
				versionSlug: "v1",
				active: true,
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("tombstone hide: new_version after tombstoned v2 mints v3")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_tombstone_mint");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await seedV1AndDraftV2({ autumn: autumnV2_3, planId });
			await stampProductTombstone({ ctx, planId, version: 2 });

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						versioning: "new_version",
						name: "V3",
						items: [messagesItem(300)],
					},
				],
			});

			await expectVersionIdentityCorrect({
				ctx,
				planId,
				version: 3,
				versionSlug: "v3",
				active: false,
			});

			const occupancy = await ProductService.listFull({
				db: ctx.db,
				orgId: ctx.org.id,
				env: ctx.env,
				inIds: [planId],
				returnAll: true,
				includeDeleted: true,
				skipCache: true,
			});
			expect(occupancy.map((product) => product.version).sort()).toEqual([
				1, 2, 3,
			]);
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);
