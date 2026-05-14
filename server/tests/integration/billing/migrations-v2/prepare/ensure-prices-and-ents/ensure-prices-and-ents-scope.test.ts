/**
 * Scope coverage for ensure_prices_and_entitlements preparation.
 *
 * Contract under test:
 *   - plan filters prepare catalog rows only for matched products.
 *   - all matched product versions get distinct prepared rows.
 *   - unmatched products do not receive prepared price / entitlement pairs.
 */

import { expect, test } from "bun:test";
import { prepare } from "@/internal/migrations/v2/prepare/prepare.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import {
	buildUpdatePlanOperations,
	createMigration,
} from "../../utils/migrationTestUtils.js";
import { prepareMigration } from "./utils/ensurePrepareTestUtils.js";

test.concurrent(`${chalk.yellowBright("migrations prepare: plan filter prepares every matched product version")}`, async () => {
	const id = "prep-ensure-all-product-versions";
	const pro = products.pro({ items: [] });
	const { autumnV1, autumnV2_2, ctx } = await initScenario({
		customerId: id,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	await autumnV1.products.update(pro.id, {
		items: [itemsV2.dashboard()],
	});

	const migration = await createMigration({
		migrationClient: autumnV2_2,
		id,
		operations: buildUpdatePlanOperations({
			planId: pro.id,
			customize: { add_items: [itemsV2.prepaidWords({ amount: 6 })] },
		}),
	});
	const prepared = await prepareMigration({ ctx, migration });
	const artifacts = prepared.result.artifacts.filter(
		(artifact) =>
			artifact.op_index === 0 &&
			artifact.kind === "add_item" &&
			artifact.item_index === 0,
	);

	expect(artifacts).toHaveLength(2);
	expect(
		new Set(artifacts.map((artifact) => artifact.internal_product_id)).size,
	).toBe(2);
	expect(new Set(artifacts.map((artifact) => artifact.price_id)).size).toBe(2);
	expect(
		new Set(artifacts.map((artifact) => artifact.entitlement_id)).size,
	).toBe(2);
});

test.concurrent(`${chalk.yellowBright("migrations prepare: one update_plan op prepares every matched plan")}`, async () => {
	const id = "prep-ensure-multi-plan-op";
	const pro = products.pro({ items: [] });
	const premium = products.premium({ items: [] });
	const { autumnV2_2, ctx } = await initScenario({
		setup: [s.products({ list: [pro, premium] })],
		actions: [],
	});

	const migration = await createMigration({
		migrationClient: autumnV2_2,
		id,
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: {
						$or: [{ plan_id: pro.id }, { plan_id: premium.id }],
					},
					customize: {
						add_items: [itemsV2.prepaidMessages({ amount: 6 })],
					},
				},
			],
		},
	});
	const prepared = await prepareMigration({ ctx, migration, dryRun: true });
	const artifacts = prepared.result.artifacts.filter(
		(artifact) =>
			artifact.op_index === 0 &&
			artifact.kind === "add_item" &&
			artifact.item_index === 0,
	);

	expect(artifacts).toHaveLength(2);
	expect(
		new Set(artifacts.map((artifact) => artifact.internal_product_id)).size,
	).toBe(2);
	expect(new Set(artifacts.map((artifact) => artifact.price_id)).size).toBe(2);
	expect(
		new Set(artifacts.map((artifact) => artifact.entitlement_id)).size,
	).toBe(2);
});

test.concurrent(`${chalk.yellowBright("migrations prepare: unmatched plans do not get prepared catalog rows")}`, async () => {
	const id = "prep-ensure-unmatched-plan-skipped";
	const pro = products.pro({ items: [] });
	const premium = products.premium({ items: [] });
	const growth = products.growth({ items: [] });
	const { autumnV2_2, ctx } = await initScenario({
		setup: [s.products({ list: [pro, premium, growth] })],
		actions: [],
	});

	const fullProducts = await ProductService.listFull({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		returnAll: true,
		inIds: [pro.id, premium.id, growth.id],
	});
	const growthProduct = fullProducts.find(
		(product) => product.id === growth.id,
	);
	if (!growthProduct) {
		throw new Error("Expected growth product to exist");
	}

	const migration = await createMigration({
		migrationClient: autumnV2_2,
		id,
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: {
						$or: [{ plan_id: pro.id }, { plan_id: premium.id }],
					},
					customize: {
						add_items: [itemsV2.prepaidMessages({ amount: 6 })],
					},
				},
			],
		},
	});
	const prepared = await prepareMigration({ ctx, migration, dryRun: true });

	const addItemArtifacts = prepared.result.artifacts.filter(
		(artifact) =>
			artifact.op_index === 0 &&
			artifact.kind === "add_item" &&
			artifact.item_index === 0,
	);
	expect(addItemArtifacts).toHaveLength(2);
	expect(
		addItemArtifacts.some(
			(artifact) => artifact.internal_product_id === growthProduct.internal_id,
		),
	).toBe(false);
	expect(
		prepared.result.prices.some(
			(price) => price.internal_product_id === growthProduct.internal_id,
		),
	).toBe(false);
	expect(
		prepared.result.entitlements.some(
			(entitlement) =>
				entitlement.internal_product_id === growthProduct.internal_id,
		),
	).toBe(false);
});

test.concurrent(`${chalk.yellowBright("migrations prepare: version-only update_plan has no output")}`, async () => {
	const id = "prep-ensure-version-only-no-output";
	const pro = products.pro({ items: [] });
	const { autumnV2_2, ctx } = await initScenario({
		setup: [s.products({ list: [pro] })],
		actions: [],
	});

	const migration = await createMigration({
		migrationClient: autumnV2_2,
		id,
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: pro.id },
					version: 2,
				},
			],
		},
	});
	const { preparedState } = await prepare({
		ctx,
		migration,
		dryRun: true,
	});

	expect(preparedState).toEqual({});
});
