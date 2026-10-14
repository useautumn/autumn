import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { buildUpdatePlanOperations, createMigration } from "../../utils/migrationTestUtils.js";
import { waitForMigrationResult } from "../../utils/runUpdatePlanMigration.js";
import { getPreparedCustomerRows } from "./utils/getPreparedCustomerRows.js";
import { expectPreparedStripePriceReused } from "./utils/expectPreparedStripeProducts.js";

test.concurrent(`${chalk.yellowBright("migrations prepare runtime: Stripe price/product reused across matched product versions")}`, async () => {
	const oldVersionCustomerId = "prep-stripe-reuse-old-version";
	const latestVersionCustomerId = "prep-stripe-reuse-latest-version";

	const pro = products.pro({
		id: "pro",
		items: [
			items.volumePrepaidMessages({
				tiers: [{ to: 500, amount: 10 }, { to: "inf", amount: 5 }],
			}),
		],
	});

	const { autumnV1, autumnV2_2, ctx } = await initScenario({
		customerId: oldVersionCustomerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.otherCustomers([{ id: latestVersionCustomerId, paymentMethod: "success" }]),
			s.products({ list: [pro] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	await autumnV1.products.update(pro.id, {
		items: [
			items.volumePrepaidMessages({
				tiers: [{ to: 500, amount: 10 }, { to: "inf", amount: 5 }],
			}),
			items.dashboard(),
		],
	});

	await autumnV2_2.billing.attach({
		customer_id: latestVersionCustomerId,
		plan_id: pro.id,
	});

	const beforeRows = await getPreparedCustomerRows({
		ctx,
		customerIds: [oldVersionCustomerId, latestVersionCustomerId],
		productId: pro.id,
	});
	const oldVersionInternalProductId = beforeRows.find(
		(row) => row.customerId === oldVersionCustomerId,
	)?.customerProductInternalProductId;
	const latestVersionInternalProductId = beforeRows.find(
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
			add_items: [
				itemsV2.volumePrepaidMessages({
					tiers: [
						{ to: 1000, amount: 20 },
						{ to: "inf", amount: 8 },
					],
				}),
			],
		},
	});
	const migrationId = `${oldVersionCustomerId}-mig-${Date.now()}`;
	await createMigration({
		migrationClient: autumnV2_2,
		id: migrationId,
		filter: { customer: { plan: { plan_id: pro.id } } },
		operations,
	});

	await autumnV2_2.migrationsV2.run({
		id: migrationId,
		dry_run: false,
	});

	const loadPriceRows = () =>
		ctx.db.query.prices.findMany({
			where: (p, { inArray: inArr }) =>
				inArr(p.internal_product_id, [
					oldVersionInternalProductId,
					latestVersionInternalProductId,
				]),
		});
	const migratedPriceFor = (
		rows: Awaited<ReturnType<typeof loadPriceRows>>,
		internalProductId: string,
	) =>
		rows.find(
			(row) =>
				row.internal_product_id === internalProductId &&
				row.is_custom === true &&
				Boolean((row.config as { stripe_prepaid_price_v2_id?: string }).stripe_prepaid_price_v2_id),
		)?.id;

	let oldVersionPriceId: string | undefined;
	let latestVersionPriceId: string | undefined;
	await waitForMigrationResult({
		timeoutMs: 30_000,
		pollIntervalMs: 1_000,
		waitFor: async () => {
			const rows = await loadPriceRows();
			oldVersionPriceId = migratedPriceFor(rows, oldVersionInternalProductId);
			latestVersionPriceId = migratedPriceFor(rows, latestVersionInternalProductId);
			if (!oldVersionPriceId || !latestVersionPriceId) {
				throw new Error(
					"Expected both matched product versions to have a migrated prepaid price row with a real Stripe id attached",
				);
			}
		},
	});
	if (!oldVersionPriceId || !latestVersionPriceId) {
		throw new Error(
			"Expected both matched product versions to have a migrated prepaid price row",
		);
	}

	expect(oldVersionPriceId).not.toBe(latestVersionPriceId);

	await expectPreparedStripePriceReused({
		ctx,
		priceIds: [oldVersionPriceId, latestVersionPriceId],
	});
});
