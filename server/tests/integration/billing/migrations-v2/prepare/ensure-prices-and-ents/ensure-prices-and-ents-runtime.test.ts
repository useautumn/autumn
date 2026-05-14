/**
 * Runtime coverage for ensure_prices_and_entitlements preparation.
 *
 * These tests verify that product-version anchored prepared catalog rows can
 * feed the customer migration execution path and are reused by customer_prices
 * and customer_entitlements.
 */

import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import {
	buildUpdatePlanOperations,
	createMigration,
	updateMigrationOperations,
} from "../../utils/migrationTestUtils.js";
import {
	expectPreparedArtifact,
	expectPreparedArtifactFieldsChanged,
	expectPreparedArtifactRowIds,
	expectPreparedCatalogContainsRows,
	prepareMigration,
} from "./utils/ensurePrepareTestUtils.js";
import {
	expectPreparedRowsAnchoredToProducts,
	waitForPreparedRowsReusedByCustomerProducts,
	waitForPreparedRowsReusedByCustomers,
} from "./utils/expectPreparedCustomerRows.js";
import { expectPreparedStripeProductCount } from "./utils/expectPreparedStripeProducts.js";
import { getPreparedCustomerRows } from "./utils/getPreparedCustomerRows.js";

test.concurrent(`${chalk.yellowBright("migrations prepare runtime: prepared product catalog rows are reused across customers")}`, async () => {
	const customerId = "prep-ensure-reuse-primary";
	const otherCustomerId = "prep-ensure-reuse-secondary";
	const free = products.base({
		id: "free",
		items: [],
	});

	const { autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.otherCustomers([{ id: otherCustomerId, paymentMethod: "success" }]),
			s.products({ list: [free] }),
		],
		actions: [
			s.billing.attach({ productId: free.id }),
			s.billing.attach({
				productId: free.id,
				customerId: otherCustomerId,
			}),
		],
	});

	const firstOperations = buildUpdatePlanOperations({
		planId: free.id,
		customize: {
			add_items: [itemsV2.dashboard(), itemsV2.prepaidWords({ amount: 3 })],
		},
	});
	const migration = await createMigration({
		migrationClient: autumnV2_2,
		id: `${customerId}-mig`,
		filter: { customer: { plan: { plan_id: free.id } } },
		operations: firstOperations,
	});
	const firstPrepared = await prepareMigration({
		ctx,
		migration,
		dryRun: true,
	});
	expectPreparedArtifact({
		result: firstPrepared,
		opIndex: 0,
		kind: "add_item",
		itemIndex: 1,
	});

	const operations = buildUpdatePlanOperations({
		planId: free.id,
		customize: {
			add_items: [itemsV2.dashboard(), itemsV2.prepaidWords({ amount: 4 })],
		},
	});
	const updatedMigration = await updateMigrationOperations({
		migrationClient: autumnV2_2,
		id: `${customerId}-mig`,
		operations,
	});
	const updatedPrepared = await prepareMigration({
		ctx,
		migration: updatedMigration,
		dryRun: true,
	});

	expectPreparedArtifactFieldsChanged({
		before: firstPrepared,
		after: updatedPrepared,
		artifact: { opIndex: 0, kind: "add_item", itemIndex: 1 },
		fields: ["price_id", "entitlement_id"],
	});

	const dashboard = expectPreparedArtifact({
		result: updatedPrepared,
		opIndex: 0,
		kind: "add_item",
		itemIndex: 0,
	});
	const priced = expectPreparedArtifact({
		result: updatedPrepared,
		opIndex: 0,
		kind: "add_item",
		itemIndex: 1,
	});
	const dashboardEntitlementId = dashboard.entitlement_id;
	const pricedRows = expectPreparedArtifactRowIds({ artifact: priced });
	if (!dashboardEntitlementId) {
		throw new Error("Expected prepared artifacts to include reusable row IDs");
	}
	expectPreparedCatalogContainsRows({
		result: updatedPrepared,
		priceIds: [pricedRows.priceId],
		entitlementIds: [pricedRows.entitlementId],
	});

	await autumnV2_2.migrationsV2.run({
		id: `${customerId}-mig`,
		dry_run: false,
	});

	const loadRows = () =>
		getPreparedCustomerRows({
			ctx,
			customerIds: [customerId, otherCustomerId],
			productId: free.id,
		});

	const rows = await waitForPreparedRowsReusedByCustomers({
		loadRows,
		customerIds: [customerId, otherCustomerId],
		priceId: pricedRows.priceId,
		entitlementIds: [dashboardEntitlementId, pricedRows.entitlementId],
	});

	expectPreparedRowsAnchoredToProducts({
		rows,
		priceIdToInternalProductId: {
			[pricedRows.priceId]: priced.internal_product_id,
		},
		entitlementIdToInternalProductId: {
			[dashboardEntitlementId]: dashboard.internal_product_id,
			[pricedRows.entitlementId]: priced.internal_product_id,
		},
	});

	await expectPreparedStripeProductCount({
		ctx,
		priceIds: [pricedRows.priceId],
		count: 1,
	});
});

test.concurrent(`${chalk.yellowBright("migrations prepare runtime: customer products on different versions use version-specific prepared rows")}`, async () => {
	const oldVersionCustomerId = "prep-ensure-version-old";
	const latestVersionCustomerId = "prep-ensure-version-latest";
	const pro = products.pro({
		id: "pro",
		items: [items.prepaidMessages({ price: 3 })],
	});

	const { autumnV1, autumnV2_2, ctx } = await initScenario({
		customerId: oldVersionCustomerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.otherCustomers([
				{ id: latestVersionCustomerId, paymentMethod: "success" },
			]),
			s.products({ list: [pro] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	await autumnV1.products.update(pro.id, {
		items: [items.prepaidMessages({ price: 3 }), items.dashboard()],
	});

	await autumnV2_2.billing.attach({
		customer_id: latestVersionCustomerId,
		plan_id: pro.id,
	});

	const customerProductRows = await getPreparedCustomerRows({
		ctx,
		customerIds: [oldVersionCustomerId, latestVersionCustomerId],
		productId: pro.id,
	});
	const oldVersionInternalProductId = customerProductRows.find(
		(row) => row.customerId === oldVersionCustomerId,
	)?.customerProductInternalProductId;
	const latestVersionInternalProductId = customerProductRows.find(
		(row) => row.customerId === latestVersionCustomerId,
	)?.customerProductInternalProductId;
	if (!oldVersionInternalProductId || !latestVersionInternalProductId) {
		throw new Error("Expected both customers to have a customer product");
	}
	expect(latestVersionInternalProductId).not.toBe(oldVersionInternalProductId);

	const operations = buildUpdatePlanOperations({
		planId: pro.id,
		customize: {
			remove_items: [{ feature_id: TestFeature.Messages }],
			add_items: [itemsV2.prepaidMessages({ amount: 6 })],
		},
	});
	const migration = await createMigration({
		migrationClient: autumnV2_2,
		id: `${oldVersionCustomerId}-mig`,
		filter: { customer: { plan: { plan_id: pro.id } } },
		operations,
	});
	const prepared = await prepareMigration({
		ctx,
		migration,
		dryRun: true,
	});
	const oldVersionArtifact = expectPreparedArtifact({
		result: prepared,
		opIndex: 0,
		kind: "add_item",
		itemIndex: 0,
		internalProductId: oldVersionInternalProductId,
	});
	const latestVersionArtifact = expectPreparedArtifact({
		result: prepared,
		opIndex: 0,
		kind: "add_item",
		itemIndex: 0,
		internalProductId: latestVersionInternalProductId,
	});
	const oldVersionRows = expectPreparedArtifactRowIds({
		artifact: oldVersionArtifact,
	});
	const latestVersionRows = expectPreparedArtifactRowIds({
		artifact: latestVersionArtifact,
	});
	expect(oldVersionRows.priceId).not.toBe(latestVersionRows.priceId);
	expect(oldVersionRows.entitlementId).not.toBe(
		latestVersionRows.entitlementId,
	);

	await autumnV2_2.migrationsV2.run({
		id: `${oldVersionCustomerId}-mig`,
		dry_run: false,
	});

	const loadRows = () =>
		getPreparedCustomerRows({
			ctx,
			customerIds: [oldVersionCustomerId, latestVersionCustomerId],
			productId: pro.id,
		});

	const rows = await waitForPreparedRowsReusedByCustomerProducts({
		loadRows,
		expected: [
			{
				customerId: oldVersionCustomerId,
				customerProductInternalProductId: oldVersionInternalProductId,
				priceId: oldVersionRows.priceId,
				entitlementIds: [oldVersionRows.entitlementId],
			},
			{
				customerId: latestVersionCustomerId,
				customerProductInternalProductId: latestVersionInternalProductId,
				priceId: latestVersionRows.priceId,
				entitlementIds: [latestVersionRows.entitlementId],
			},
		],
	});

	expectPreparedRowsAnchoredToProducts({
		rows,
		priceIdToInternalProductId: {
			[oldVersionRows.priceId]: oldVersionInternalProductId,
			[latestVersionRows.priceId]: latestVersionInternalProductId,
		},
		entitlementIdToInternalProductId: {
			[oldVersionRows.entitlementId]: oldVersionInternalProductId,
			[latestVersionRows.entitlementId]: latestVersionInternalProductId,
		},
	});

	await expectPreparedStripeProductCount({
		ctx,
		priceIds: [oldVersionRows.priceId, latestVersionRows.priceId],
		count: 1,
	});
});

test.concurrent(`${chalk.yellowBright("migrations prepare runtime: multi-plan op reuses prepared rows across customers and entities")}`, async () => {
	const customerId = "prep-ensure-multi-plan-primary";
	const otherCustomerId = "prep-ensure-multi-plan-secondary";
	const pro = products.pro({ items: [] });
	const premium = products.premium({ items: [] });

	const { autumnV1, autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.otherCustomers([{ id: otherCustomerId, paymentMethod: "success" }]),
			s.products({ list: [pro, premium] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [],
	});

	await autumnV1.entities.create(otherCustomerId, [
		{ id: "ent-1", name: "Entity 1", feature_id: TestFeature.Users },
		{ id: "ent-2", name: "Entity 2", feature_id: TestFeature.Users },
	]);

	for (const targetCustomerId of [customerId, otherCustomerId]) {
		await autumnV2_2.billing.attach({
			customer_id: targetCustomerId,
			plan_id: pro.id,
			entity_id: "ent-1",
		});
		await autumnV2_2.billing.attach({
			customer_id: targetCustomerId,
			plan_id: premium.id,
			entity_id: "ent-2",
		});
	}

	const customerProductRows = await getPreparedCustomerRows({
		ctx,
		customerIds: [customerId, otherCustomerId],
		productIds: [pro.id, premium.id],
	});
	const proInternalProductId = customerProductRows.find(
		(row) => row.customerProductProductId === pro.id,
	)?.customerProductInternalProductId;
	const premiumInternalProductId = customerProductRows.find(
		(row) => row.customerProductProductId === premium.id,
	)?.customerProductInternalProductId;
	if (!proInternalProductId || !premiumInternalProductId) {
		throw new Error("Expected pro and premium customer products");
	}
	expect(proInternalProductId).not.toBe(premiumInternalProductId);

	const operations = {
		customer: [
			{
				type: "update_plan" as const,
				plan_filter: {
					$or: [{ plan_id: pro.id }, { plan_id: premium.id }],
				},
				customize: {
					add_items: [itemsV2.prepaidMessages({ amount: 6 })],
				},
			},
		],
	};
	const migration = await createMigration({
		migrationClient: autumnV2_2,
		id: `${customerId}-mig`,
		filter: {
			customer: {
				plan: { $or: [{ plan_id: pro.id }, { plan_id: premium.id }] },
			},
		},
		operations,
	});
	const prepared = await prepareMigration({
		ctx,
		migration,
		dryRun: true,
	});
	const proArtifact = expectPreparedArtifact({
		result: prepared,
		opIndex: 0,
		kind: "add_item",
		itemIndex: 0,
		internalProductId: proInternalProductId,
	});
	const premiumArtifact = expectPreparedArtifact({
		result: prepared,
		opIndex: 0,
		kind: "add_item",
		itemIndex: 0,
		internalProductId: premiumInternalProductId,
	});
	const proRows = expectPreparedArtifactRowIds({ artifact: proArtifact });
	const premiumRows = expectPreparedArtifactRowIds({
		artifact: premiumArtifact,
	});
	expect(proRows.priceId).not.toBe(premiumRows.priceId);
	expect(proRows.entitlementId).not.toBe(premiumRows.entitlementId);

	await autumnV2_2.migrationsV2.run({
		id: `${customerId}-mig`,
		dry_run: false,
	});

	const loadRows = () =>
		getPreparedCustomerRows({
			ctx,
			customerIds: [customerId, otherCustomerId],
			productIds: [pro.id, premium.id],
		});
	const rows = await waitForPreparedRowsReusedByCustomerProducts({
		loadRows,
		expected: [
			{
				customerId,
				productId: pro.id,
				entityId: "ent-1",
				customerProductInternalProductId: proInternalProductId,
				priceId: proRows.priceId,
				entitlementIds: [proRows.entitlementId],
			},
			{
				customerId,
				productId: premium.id,
				entityId: "ent-2",
				customerProductInternalProductId: premiumInternalProductId,
				priceId: premiumRows.priceId,
				entitlementIds: [premiumRows.entitlementId],
			},
			{
				customerId: otherCustomerId,
				productId: pro.id,
				entityId: "ent-1",
				customerProductInternalProductId: proInternalProductId,
				priceId: proRows.priceId,
				entitlementIds: [proRows.entitlementId],
			},
			{
				customerId: otherCustomerId,
				productId: premium.id,
				entityId: "ent-2",
				customerProductInternalProductId: premiumInternalProductId,
				priceId: premiumRows.priceId,
				entitlementIds: [premiumRows.entitlementId],
			},
		],
	});

	expectPreparedRowsAnchoredToProducts({
		rows,
		priceIdToInternalProductId: {
			[proRows.priceId]: proInternalProductId,
			[premiumRows.priceId]: premiumInternalProductId,
		},
		entitlementIdToInternalProductId: {
			[proRows.entitlementId]: proInternalProductId,
			[premiumRows.entitlementId]: premiumInternalProductId,
		},
	});

	await expectPreparedStripeProductCount({
		ctx,
		priceIds: [proRows.priceId, premiumRows.priceId],
		count: 2,
	});
});
