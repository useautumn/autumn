/** Red left older omitted versions behind; green removes every omitted explicit version. */

import { expect, test } from "bun:test";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { ProductService } from "@/internal/products/ProductService.js";

test(`${chalk.yellowBright("catalog: update removes every omitted explicit version")}`, async () => {
	const suffix = Math.random().toString(36).slice(2, 9);
	const planId = `catalog_remove_versions_${suffix}`;
	const product = products.pro({ id: planId, items: [] });
	const { autumnV2_2, ctx } = await initScenario({
		customerId: `catalog-remove-versions-${suffix}`,
		setup: [s.products({ list: [product], prefix: "" })],
		actions: [],
	});

	for (const name of ["Version 2", "Version 3"]) {
		await autumnV2_2.post("/catalog.update", {
			plans: [{ plan_id: planId, name, force_version: true }],
		});
	}

	const productsBefore = await ProductService.listFull({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		returnAll: true,
	});
	const skipPlanIds = [
		...new Set(
			productsBefore
				.map(({ id }) => id)
				.filter((currentPlanId) => currentPlanId !== planId),
		),
	];

	await autumnV2_2.catalog.update({
		features: [],
		plans: [{ plan_id: planId, version: 1 }],
		skip_deletions: false,
		skip_feature_ids: ctx.features.map(({ id }) => id),
		skip_plan_ids: skipPlanIds,
	});

	const versions = await ProductService.listFull({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		inIds: [planId],
		returnAll: true,
	});
	expect(versions.map(({ version }) => version)).toEqual([1]);
});
