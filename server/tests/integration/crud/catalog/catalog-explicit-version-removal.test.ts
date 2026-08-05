/** Red either left omitted versions behind or hard-deleted referenced plans; green removes or archives safely. */

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

test(`${chalk.yellowBright("catalog: update removes an entirely omitted versioned plan once")}`, async () => {
	const suffix = Math.random().toString(36).slice(2, 9);
	const planId = `catalog_remove_plan_${suffix}`;
	const product = products.pro({ id: planId, items: [] });
	const { autumnV2_2, ctx } = await initScenario({
		customerId: `catalog-remove-plan-${suffix}`,
		setup: [s.products({ list: [product], prefix: "" })],
		actions: [],
	});

	await autumnV2_2.post("/catalog.update", {
		plans: [{ plan_id: planId, name: "Version 2", force_version: true }],
	});

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
		plans: [],
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
	expect(versions).toHaveLength(0);
});

test(`${chalk.yellowBright("catalog: update archives an omitted plan with an expired customer")}`, async () => {
	const suffix = Math.random().toString(36).slice(2, 9);
	const product = products.pro({ id: "catalog_remove_expired", items: [] });
	const planId = `${product.id}_${suffix}`;
	const customerId = `catalog-remove-expired-${suffix}`;
	const { autumnV1, autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [product], prefix: suffix }),
		],
		actions: [s.attach({ productId: product.id })],
	});

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		product_id: planId,
		cancel_action: "cancel_immediately",
	});

	const productsBefore = await ProductService.listFull({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		returnAll: true,
	});
	const params = {
		features: [],
		plans: [],
		skip_deletions: false,
		skip_feature_ids: ctx.features.map(({ id }) => id),
		skip_plan_ids: productsBefore
			.map(({ id }) => id)
			.filter((id) => id !== planId),
	};

	const preview = await autumnV2_2.catalog.previewUpdate(params);
	await autumnV2_2.catalog.update(params);

	expect(preview.plan_changes).toContainEqual(
		expect.objectContaining({ plan_id: planId, will_archive: true }),
	);
	const archived = await ProductService.get({
		db: ctx.db,
		id: planId,
		orgId: ctx.org.id,
		env: ctx.env,
	});
	expect(archived?.archived).toBe(true);
});
