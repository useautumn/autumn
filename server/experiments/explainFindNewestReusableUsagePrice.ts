import {
	AppEnv,
	BillWhen,
	isAllocatedV2Price,
	isConsumablePrice,
	organizations,
	type Price,
	prices,
	PriceType,
	products,
	type UsagePriceConfig,
} from "@autumn/shared";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { initDrizzle } from "../src/db/initDrizzle";
import { composeNewestReusableUsagePriceQuery } from "../src/internal/products/prices/repos/findNewestReusableUsagePrice";

const STATEMENT_TIMEOUT_MS = 30_000;

const dbUrl = process.env.DATABASE_REPLICA_URL || process.env.DATABASE_URL || "";
const maskedUrl = dbUrl.replace(/:\/\/[^@]+@/, "://***:***@") || "(empty)";

if (/autumn-prod|-prod-/i.test(dbUrl) && process.env.ALLOW_NON_STAGING !== "1") {
	throw new Error(`DATABASE_URL looks like prod (${maskedUrl}). Use staging.`);
}

const orgSlug = (process.env.EXPLAIN_ORG_SLUG ?? "mintlify").toLowerCase();
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
		name: "explain-reusable-usage-price",
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
				.innerJoin(prices, eq(prices.internal_product_id, products.internal_id))
				.where(
					and(
						eq(products.org_id, org.id),
						eq(products.env, env),
						isNull(products.deleted_at),
						sql`${prices.config} ->> 'type' = ${PriceType.Usage}`,
						sql`${prices.config} ->> 'bill_when' NOT IN (${BillWhen.InAdvance}, ${BillWhen.StartOfPeriod})`,
					),
				)
				.groupBy(products.id)
				.orderBy(desc(sql`count(*)`))
				.limit(1)
		)[0],
		`usage-price product for ${orgSlug}`,
	);

	const sample = requireRow(
		(
			await db
				.select({ price: prices })
				.from(prices)
				.innerJoin(products, eq(prices.internal_product_id, products.internal_id))
				.where(
					and(
						eq(products.org_id, org.id),
						eq(products.env, env),
						eq(products.id, product.id),
						isNull(products.deleted_at),
						sql`${prices.config} ->> 'type' = ${PriceType.Usage}`,
						sql`${prices.config} ->> 'bill_when' NOT IN (${BillWhen.InAdvance}, ${BillWhen.StartOfPeriod})`,
					),
				)
				.orderBy(desc(prices.created_at))
				.limit(1)
		)[0],
		`sample usage price on ${product.id}`,
	);

	const targetPrice = sample.price as Price;
	if (
		!isConsumablePrice(targetPrice) &&
		!isAllocatedV2Price(targetPrice)
	) {
		console.log(
			"sample is usage-in-arrear-shaped but not consumable/allocated-v2; still explaining the coarse query",
		);
	}

	const config = targetPrice.config as UsagePriceConfig;
	const query = composeNewestReusableUsagePriceQuery({
		db,
		orgId: org.id,
		env,
		productId: product.id,
		excludePriceId: targetPrice.id,
		targetIsCustom: targetPrice.is_custom === true,
		targetCurrency: orgDefaultCurrency,
		orgDefaultCurrency,
		featureId: config.feature_id,
		internalFeatureId: config.internal_feature_id,
		billWhen: config.bill_when ?? BillWhen.EndOfPeriod,
		interval: config.interval,
		intervalCount: config.interval_count ?? 1,
		billingUnits: config.billing_units ?? 1,
		shouldProrate: config.should_prorate ?? false,
	});

	console.log(
		`product.id=${product.id}  usage prices=${product.priceCount}  feature=${config.feature_id}  bill_when=${config.bill_when}`,
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
