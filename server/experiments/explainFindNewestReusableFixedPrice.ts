import {
	AppEnv,
	BillingInterval,
	isFixedPrice,
	organizations,
	type Price,
	priceConfigForCurrency,
	prices,
	PriceType,
	products,
} from "@autumn/shared";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { initDrizzle } from "../src/db/initDrizzle";
import { composeNewestReusableFixedPriceQuery } from "../src/internal/products/prices/repos/findNewestReusableFixedPrice";

const STATEMENT_TIMEOUT_MS = 30_000;

// Infisical staging DATABASE_URL is the unit-test Neon. Mintlify lives on the replica.
const dbUrl = process.env.DATABASE_REPLICA_URL || process.env.DATABASE_URL || "";
const maskedUrl = dbUrl.replace(/:\/\/[^@]+@/, "://***:***@") || "(empty)";

if (/autumn-prod|-prod-/i.test(dbUrl) && process.env.ALLOW_NON_STAGING !== "1") {
	throw new Error(`DATABASE_URL looks like prod (${maskedUrl}). Use staging.`);
}

const orgSlug = (
	process.env.EXPLAIN_ORG_SLUG ?? "mintlify"
).toLowerCase();
const env = process.env.EXPLAIN_ENV === "sandbox" ? AppEnv.Sandbox : AppEnv.Live;
const analyze = process.argv.includes("--analyze");

const requireRow = <T>(row: T | undefined, label: string): T => {
	if (!row) throw new Error(`${label} not found`);
	return row;
};

const main = async () => {
	console.log("DATABASE URL host:", maskedUrl);
	console.log(`org slug: ${orgSlug}  env: ${env}  analyze: ${analyze}`);

	const { db } = initDrizzle({
		databaseUrl: dbUrl,
		maxConnections: 2,
		name: "explain-reusable-price",
	});

	const org = requireRow(
		(
			await db
				.select({
					id: organizations.id,
					slug: organizations.slug,
					default_currency: organizations.default_currency,
				})
				.from(organizations)
				.where(sql`lower(${organizations.slug}) = ${orgSlug}`)
				.limit(1)
		)[0],
		`organization slug ${orgSlug}`,
	);

	const orgDefaultCurrency = (org.default_currency ?? "usd").toLowerCase();

	const product = requireRow(
		(
			await db
				.select({
					id: products.id,
					priceCount: sql<number>`count(*)::int`,
				})
				.from(products)
				.innerJoin(
					prices,
					eq(prices.internal_product_id, products.internal_id),
				)
				.where(
					and(
						eq(products.org_id, org.id),
						eq(products.env, env),
						isNull(products.deleted_at),
						sql`${prices.config} ->> 'type' = ${PriceType.Fixed}`,
					),
				)
				.groupBy(products.id)
				.orderBy(desc(sql`count(*)`))
				.limit(1)
		)[0],
		`fixed-price product for ${orgSlug}`,
	);

	const sample = requireRow(
		(
			await db
				.select({ price: prices })
				.from(prices)
				.innerJoin(
					products,
					eq(prices.internal_product_id, products.internal_id),
				)
				.where(
					and(
						eq(products.org_id, org.id),
						eq(products.env, env),
						eq(products.id, product.id),
						isNull(products.deleted_at),
						sql`${prices.config} ->> 'type' = ${PriceType.Fixed}`,
					),
				)
				.orderBy(desc(prices.created_at))
				.limit(1)
		)[0],
		`sample fixed price on ${product.id}`,
	);

	const targetPrice = sample.price as Price;
	if (!isFixedPrice(targetPrice)) {
		throw new Error("sample price is not fixed");
	}

	const targetCurrency = orgDefaultCurrency;
	const { amount } = priceConfigForCurrency({
		config: targetPrice.config,
		currency: targetCurrency,
		orgDefault: orgDefaultCurrency,
	});
	if (amount == null) {
		throw new Error(`sample price has no ${targetCurrency} amount`);
	}

	const query = composeNewestReusableFixedPriceQuery({
		db,
		orgId: org.id,
		env,
		productId: product.id,
		excludePriceId: targetPrice.id,
		targetIsCustom: targetPrice.is_custom === true,
		targetCurrency,
		orgDefaultCurrency,
		amount,
		interval: targetPrice.config.interval ?? BillingInterval.Month,
		intervalCount: targetPrice.config.interval_count ?? 1,
	});

	console.log(
		`product.id=${product.id}  fixed prices=${product.priceCount}  amount=${amount}  interval=${targetPrice.config.interval}`,
	);

	const explain = analyze
		? sql`EXPLAIN (ANALYZE, BUFFERS, VERBOSE, FORMAT TEXT) ${query}`
		: sql`EXPLAIN (VERBOSE, FORMAT TEXT) ${query}`;

	const plan = await db.transaction(async (tx) => {
		await tx.execute(
			sql.raw(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`),
		);
		return tx.execute(explain);
	});

	const rows = Array.isArray(plan)
		? plan
		: ((plan as { rows?: Record<string, unknown>[] }).rows ?? []);
	for (const row of rows) {
		console.log((row as Record<string, unknown>)["QUERY PLAN"]);
	}

	process.exit(0);
};

await main();
