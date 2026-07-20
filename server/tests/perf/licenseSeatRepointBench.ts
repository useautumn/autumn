/** Benchmarks a pool definition and 100k assigned-seat price repoints.
 * Run with `bun tests/perf/licenseSeatRepointBench.ts`. */

import {
	AppEnv,
	BillingInterval,
	customerLicenses,
	customerProducts,
	customers,
	planLicenses,
	prices,
	products,
} from "@autumn/shared";
import { eq, sql } from "drizzle-orm";
import { initDrizzle } from "@/db/initDrizzle";
import { customerLicenseRepo } from "@/internal/licenses/repos/customerLicenseRepo";
import { licenseAssignmentRepo } from "@/internal/licenses/repos/licenseAssignmentRepo";

const SEATS = 100_000;
const ORG_SLUG = "unit-test-org";
const ENV = AppEnv.Sandbox;

const { db, client } = initDrizzle({ maxConnections: 5 });

const time = async <T>(label: string, fn: () => Promise<T>): Promise<T> => {
	const start = performance.now();
	const result = await fn();
	console.log(
		`${label.padEnd(44)} ${(performance.now() - start).toFixed(0)}ms`,
	);
	return result;
};

const main = async () => {
	const org = await db.query.organizations.findFirst({
		where: (organizations, { eq: whereEq }) =>
			whereEq(organizations.slug, ORG_SLUG),
	});
	if (!org) throw new Error(`Org ${ORG_SLUG} not found`);

	const run = `bench_${Date.now()}`;
	const now = Date.now();
	const id = (kind: string, index?: number | string) =>
		index === undefined ? `${run}_${kind}` : `${run}_${kind}_${index}`;

	// ── Small fixture rows (typed inserts) ────────────────────────────────
	await db.insert(products).values(
		(["parent", "license"] as const).map((kind) => ({
			internal_id: id(`prod_${kind}`),
			id: id(`prod_${kind}_pub`),
			org_id: org.id,
			env: ENV,
			name: `Bench ${kind}`,
			created_at: now,
		})),
	);

	const priceRow = (kind: "old" | "new", amount: number) => ({
		id: id(`price_${kind}`),
		org_id: org.id,
		internal_product_id: id("prod_license"),
		created_at: now,
		config: {
			type: "fixed" as const,
			amount,
			interval: BillingInterval.Month,
			interval_count: 1,
			feature_id: null,
			internal_feature_id: null,
		},
	});
	await db.insert(prices).values([priceRow("old", 20), priceRow("new", 30)]);

	await db.insert(planLicenses).values(
		(["old", "new"] as const).map((kind) => ({
			id: id(`plan_license_${kind}`),
			parent_internal_product_id: id("prod_parent"),
			license_internal_product_id: id("prod_license"),
			is_custom: kind === "new",
			included: 1,
			prepaid_only: true,
			customized: false,
			created_at: now,
			updated_at: now,
		})),
	);

	await db.insert(customers).values({
		internal_id: id("cus"),
		id: id("cus_pub"),
		org_id: org.id,
		env: ENV,
		name: "Bench customer",
		created_at: now,
	});

	await db.insert(customerProducts).values({
		id: id("parent_cp"),
		internal_customer_id: id("cus"),
		internal_product_id: id("prod_parent"),
		product_id: id("prod_parent_pub"),
		status: "active",
		created_at: now,
		starts_at: now,
	});

	const linkId = id("link");
	await db.insert(customerLicenses).values({
		id: id("pool"),
		link_id: linkId,
		internal_customer_id: id("cus"),
		parent_customer_product_id: id("parent_cp"),
		license_internal_product_id: id("prod_license"),
		plan_license_id: id("plan_license_old"),
		granted: SEATS + 1,
		remaining: 1,
		paid_quantity: SEATS,
		created_at: now,
		updated_at: now,
	});

	// ── Bulk rows via generate_series ─────────────────────────────────────
	await time(`seed ${SEATS} entities`, () =>
		db.execute(sql`
			INSERT INTO entities (internal_id, id, org_id, env, name, created_at, internal_customer_id)
			SELECT ${run} || '_ent_' || i, ${run} || '_ent_pub_' || i, ${org.id}, ${ENV},
				'Bench seat ' || i, ${now}, ${id("cus")}
			FROM generate_series(1, ${sql.raw(String(SEATS))}) AS i
		`),
	);

	await time(`seed ${SEATS} seat customer_products`, () =>
		db.execute(sql`
			INSERT INTO customer_products
				(id, internal_customer_id, customer_id, internal_product_id, product_id,
				 internal_entity_id, entity_id, customer_license_link_id, status, created_at, starts_at)
			SELECT ${run} || '_seat_' || i, ${id("cus")}, ${id("cus_pub")},
				${id("prod_license")}, ${id("prod_license_pub")},
				${run} || '_ent_' || i, ${run} || '_ent_pub_' || i,
				${linkId}, 'active', ${now}, ${now}
			FROM generate_series(1, ${sql.raw(String(SEATS))}) AS i
		`),
	);

	await time(`seed ${SEATS} customer_prices`, () =>
		db.execute(sql`
			INSERT INTO customer_prices (id, created_at, price_id, internal_customer_id, customer_product_id)
			SELECT ${run} || '_cp_' || i, ${now}, ${id("price_old")}, ${id("cus")}, ${run} || '_seat_' || i
			FROM generate_series(1, ${sql.raw(String(SEATS))}) AS i
		`),
	);

	// ── The executor under test ───────────────────────────────────────────
	console.log("\n── executor ──");

	await time("pool half: repointDefinition (1 row)", () =>
		customerLicenseRepo.repointDefinition({
			db,
			customerLicenseId: id("pool"),
			planLicenseId: id("plan_license_new"),
			included: 1,
			paidQuantity: SEATS,
		}),
	);

	await time(`seat half: repointSeatPrices (${SEATS} rows)`, () =>
		licenseAssignmentRepo.repointSeatPrices({
			db,
			customerLicenseLinkId: linkId,
			fromPriceId: id("price_old"),
			toPriceId: id("price_new"),
		}),
	);

	// ── Verify convergence ────────────────────────────────────────────────
	console.log("\n── verify ──");
	const [{ count: priceCount }] = (await db.execute(
		sql`SELECT count(*)::int AS count FROM customer_prices WHERE price_id = ${id("price_new")}`,
	)) as unknown as [{ count: number }];
	const [pool] = await db
		.select()
		.from(customerLicenses)
		.where(eq(customerLicenses.id, id("pool")));
	console.log(
		`prices converged: ${priceCount}/${SEATS} | pool def: ${pool.plan_license_id === id("plan_license_new") ? "repointed" : "STALE"}`,
	);

	// ── Cleanup ───────────────────────────────────────────────────────────
	console.log("\n── cleanup ──");
	await time("delete customer_prices", () =>
		db.execute(
			sql`DELETE FROM customer_prices WHERE internal_customer_id = ${id("cus")}`,
		),
	);
	await time("delete seats + parent", () =>
		db.execute(
			sql`DELETE FROM customer_products WHERE internal_customer_id = ${id("cus")}`,
		),
	);
	await time("delete entities", () =>
		db.execute(
			sql`DELETE FROM entities WHERE internal_customer_id = ${id("cus")}`,
		),
	);
	await time("delete customer + catalog", async () => {
		await db.delete(customers).where(eq(customers.internal_id, id("cus")));
		await db.execute(
			sql`DELETE FROM products WHERE internal_id IN (${id("prod_parent")}, ${id("prod_license")})`,
		);
	});

	await client.end();
};

await main();
process.exit(0);
