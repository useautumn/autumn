/**
 * Runtime coverage for ensure_prices_and_entitlements preparation.
 *
 * These tests verify that prepared productless catalog rows can feed the
 * customer migration execution path and are reused by customer_prices and
 * customer_entitlements.
 */

import { test } from "bun:test";
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
	expectPreparedRowsProductless,
	waitForPreparedRowsReusedByCustomers,
} from "./utils/expectPreparedCustomerRows.js";
import { getPreparedCustomerRows } from "./utils/getPreparedCustomerRows.js";

test.concurrent(`${chalk.yellowBright("migrations prepare runtime: prepared productless catalog rows are reused across customers")}`, async () => {
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

	expectPreparedRowsProductless({
		rows,
		priceIds: [pricedRows.priceId],
		entitlementIds: [dashboardEntitlementId, pricedRows.entitlementId],
	});
});
