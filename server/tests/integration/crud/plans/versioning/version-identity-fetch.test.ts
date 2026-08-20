/**
 * Version identity read path — product fetching.
 *
 * Contract under test:
 *   Omit-version get/list/catalog.get resolve the active pointer, not max(version).
 *   Explicit version lookups are unchanged.
 */

import { expect, test } from "bun:test";
import { type ApiPlanV1, ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { invalidateProductsCache } from "@/external/redis/actions/productsCache/productsCache.js";
import { ProductService } from "@/internal/products/ProductService.js";

type TestContext = Awaited<ReturnType<typeof initScenario>>["ctx"];

const monthlyMessagesItem = (included: number) => ({
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

const setupVersionedPlan = async (testId: string) => {
	const base = products.base({
		id: `version_identity_fetch_${testId}`,
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const { autumnV2_3, ctx } = await initScenario({
		customerId: `version-identity-fetch-${testId}`,
		setup: [s.customer({}), s.products({ list: [base] })],
		actions: [],
	});
	await autumnV2_3.catalogV2.update({
		plans: [
			{
				plan_id: base.id,
				items: [monthlyMessagesItem(500)],
				versioning: "new_version",
			},
		],
	});
	await forceActiveVersion({ ctx, planId: base.id, version: 1 });
	return { autumnV2_3, ctx, planId: base.id };
};

test.concurrent(
	`${chalk.yellowBright("version identity fetch: getFull omit-version returns the active row, not max")}`,
	async () => {
		const { ctx, planId } = await setupVersionedPlan("getfull");

		const omitVersion = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: planId,
			orgId: ctx.org.id,
			env: ctx.env,
		});
		expect(omitVersion.version).toBe(1);
		expect(omitVersion.active).toBe(true);

		const pinned = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: planId,
			orgId: ctx.org.id,
			env: ctx.env,
			version: 2,
		});
		expect(pinned.version).toBe(2);
		expect(pinned.active).toBe(false);
	},
);

test.concurrent(
	`${chalk.yellowBright("version identity fetch: listFull omit-version returns the active row")}`,
	async () => {
		const { ctx, planId } = await setupVersionedPlan("listfull");

		const listed = await ProductService.listFull({
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
			inIds: [planId],
			skipCache: true,
		});
		expect(listed).toHaveLength(1);
		expect(listed[0]?.version).toBe(1);
		expect(listed[0]?.active).toBe(true);
	},
);

test.concurrent(
	`${chalk.yellowBright("version identity fetch: catalogV2.get and plans.get return the active row")}`,
	async () => {
		const { autumnV2_3, planId } = await setupVersionedPlan("catalog");

		const catalog = await autumnV2_3.catalogV2.get({
			include_archived: true,
		});
		const catalogPlan = catalog.plans.find((plan) => plan.id === planId);
		expect(catalogPlan?.version).toBe(1);

		const plan = await autumnV2_3.products.get<ApiPlanV1>(planId);
		expect(plan.version).toBe(1);

		const listed = await autumnV2_3.products.list<ApiPlanV1[]>();
		const listedPlan = listed.list.find((item) => item.id === planId);
		expect(listedPlan?.version).toBe(1);
	},
);
