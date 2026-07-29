/**
 * Seeds the bench org with N customers spread across every anchor-ladder
 * shape, so each migration query path can be benchmarked in isolation via
 * its plan_filter:
 *
 *   shape     %   plan              rung exercised
 *   sibling   55  bench-free        sibling cusEnt anchor (monthly Messages)
 *   freeBare  15  bench-free-bare   starts_at fallback
 *   cpAnchor  10  bench-free-bare   cp.billing_cycle_anchor
 *   paidSub   10  bench-paid        subscriptions.billing_cycle_anchor_seconds
 *                                   (mock sub row + $20/mo cusPrice, no Stripe)
 *   paidNow    5  bench-paid        paid-recurring "now" fallback (cusPrice only)
 *   custom     5  bench-free        is_custom → skipped partition path
 *
 * Pure server-side generate_series inserts — no API/Stripe calls. Reruns are
 * resumable (ON CONFLICT DO NOTHING).
 *
 *   bun tests/perf/batch-migrations/seedBatchBench.ts --customers 4000000
 *   bun tests/perf/batch-migrations/seedBatchBench.ts --reset
 *
 * For a full reset at 4M scale, prefer re-branching the Neon bench branch —
 * --reset issues row DELETEs and is only sensible for small seeds.
 */

import { CusProductStatus } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { type SQL, sql } from "drizzle-orm";
import {
	BENCH_CUSTOMER_ENTITLEMENT_PREFIX,
	BENCH_CUSTOMER_ID_PREFIX,
	BENCH_CUSTOMER_PRICE_PREFIX,
	BENCH_CUSTOMER_PRODUCT_PREFIX,
	BENCH_ENV,
	BENCH_FREE_BARE_PRODUCT_ID,
	BENCH_FREE_PRODUCT_ID,
	BENCH_INTERNAL_CUSTOMER_PREFIX,
	BENCH_PAID_PRODUCT_ID,
	BENCH_STRIPE_SUBSCRIPTION_PREFIX,
	BENCH_SUBSCRIPTION_PREFIX,
	type BenchContext,
	getBenchContext,
} from "./utils/benchContext.js";

const DAY_MS = 86_400_000;
const APPROX_MONTH_MS = 30 * DAY_MS;

type BenchShape = {
	key: string;
	fraction: number;
	productId: string;
	productInternalId: (products: BenchContext["benchProducts"]) => string;
	withSiblingEntitlement?: boolean;
	withCpAnchor?: boolean;
	withCustomerPrice?: boolean;
	withSubscription?: boolean;
	isCustom?: boolean;
};

const SHAPES: BenchShape[] = [
	{
		key: "sibling",
		fraction: 0.55,
		productId: BENCH_FREE_PRODUCT_ID,
		productInternalId: (products) => products.free.internalId,
		withSiblingEntitlement: true,
	},
	{
		key: "freeBare",
		fraction: 0.15,
		productId: BENCH_FREE_BARE_PRODUCT_ID,
		productInternalId: (products) => products.freeBare.internalId,
	},
	{
		key: "cpAnchor",
		fraction: 0.1,
		productId: BENCH_FREE_BARE_PRODUCT_ID,
		productInternalId: (products) => products.freeBare.internalId,
		withCpAnchor: true,
	},
	{
		key: "paidSub",
		fraction: 0.1,
		productId: BENCH_PAID_PRODUCT_ID,
		productInternalId: (products) => products.paid.internalId,
		withCustomerPrice: true,
		withSubscription: true,
	},
	{
		key: "paidNow",
		fraction: 0.05,
		productId: BENCH_PAID_PRODUCT_ID,
		productInternalId: (products) => products.paid.internalId,
		withCustomerPrice: true,
	},
	{
		key: "custom",
		fraction: 0.05,
		productId: BENCH_FREE_PRODUCT_ID,
		productInternalId: (products) => products.free.internalId,
		withSiblingEntitlement: true,
		isCustom: true,
	},
];

const parseArgs = () => {
	const args = process.argv.slice(2);
	const get = (flag: string) => {
		const index = args.indexOf(flag);
		return index === -1 ? undefined : args[index + 1];
	};
	return {
		customers: Number(get("--customers") ?? 4_000_000),
		chunk: Number(get("--chunk") ?? 200_000),
		reset: args.includes("--reset"),
	};
};

const seedShapeChunk = async ({
	bench,
	shape,
	start,
	end,
	now,
}: {
	bench: BenchContext;
	shape: BenchShape;
	start: number;
	end: number;
	now: number;
}) => {
	const { ctx, org, benchProducts } = bench;
	const { db } = ctx;

	// starts_at spreads deterministically across the past year so anchors vary
	// per customer; the same expression repeats across tables without joins.
	const startsAt = sql`${now}::bigint - (i % 365) * ${DAY_MS}::bigint`;
	const series = sql`GENERATE_SERIES(${start}::int, ${end}::int) AS g(i)`;

	await db.execute(sql`
		INSERT INTO customers (internal_id, id, org_id, env, created_at, name)
		SELECT
			${BENCH_INTERNAL_CUSTOMER_PREFIX} || i,
			${BENCH_CUSTOMER_ID_PREFIX} || i,
			${org.id},
			${BENCH_ENV},
			${startsAt},
			'Bench ' || i
		FROM ${series}
		ON CONFLICT DO NOTHING
	`);

	const cpAnchorColumn: SQL = shape.withCpAnchor
		? sql`${startsAt} + ${3 * DAY_MS}::bigint`
		: sql`NULL`;
	const subscriptionIdsColumn: SQL = shape.withSubscription
		? sql`ARRAY[${BENCH_STRIPE_SUBSCRIPTION_PREFIX} || i]`
		: sql`NULL`;

	await db.execute(sql`
		INSERT INTO customer_products (
			id, internal_customer_id, internal_product_id, created_at, status,
			starts_at, is_custom, product_id, customer_id, billing_cycle_anchor,
			subscription_ids
		)
		SELECT
			${BENCH_CUSTOMER_PRODUCT_PREFIX} || i,
			${BENCH_INTERNAL_CUSTOMER_PREFIX} || i,
			${shape.productInternalId(benchProducts)},
			${startsAt},
			${CusProductStatus.Active},
			${startsAt},
			${shape.isCustom === true},
			${shape.productId},
			${BENCH_CUSTOMER_ID_PREFIX} || i,
			${cpAnchorColumn},
			${subscriptionIdsColumn}
		FROM ${series}
		ON CONFLICT DO NOTHING
	`);

	if (shape.withSiblingEntitlement) {
		await db.execute(sql`
			INSERT INTO customer_entitlements (
				id, customer_product_id, entitlement_id, internal_customer_id,
				internal_entity_id, internal_feature_id, unlimited, balance,
				created_at, reset_cycle_anchor, next_reset_at, usage_allowed,
				separate_interval, adjustment, additional_balance, entities,
				expires_at, cache_version, customer_id, feature_id, external_id
			)
			SELECT
				${BENCH_CUSTOMER_ENTITLEMENT_PREFIX} || i,
				${BENCH_CUSTOMER_PRODUCT_PREFIX} || i,
				${benchProducts.free.entitlementId},
				${BENCH_INTERNAL_CUSTOMER_PREFIX} || i,
				NULL,
				${benchProducts.messagesInternalFeatureId},
				false,
				100,
				${startsAt},
				${startsAt},
				${startsAt} + ${APPROX_MONTH_MS}::bigint,
				false,
				false,
				0,
				0,
				NULL,
				NULL,
				0,
				${BENCH_CUSTOMER_ID_PREFIX} || i,
				${TestFeature.Messages},
				NULL
			FROM ${series}
			ON CONFLICT DO NOTHING
		`);
	}

	if (shape.withCustomerPrice) {
		await db.execute(sql`
			INSERT INTO customer_prices (
				id, created_at, price_id, internal_customer_id, customer_product_id
			)
			SELECT
				${BENCH_CUSTOMER_PRICE_PREFIX} || i,
				${startsAt},
				${benchProducts.paid.priceId},
				${BENCH_INTERNAL_CUSTOMER_PREFIX} || i,
				${BENCH_CUSTOMER_PRODUCT_PREFIX} || i
			FROM ${series}
			ON CONFLICT DO NOTHING
		`);
	}

	if (shape.withSubscription) {
		await db.execute(sql`
			INSERT INTO subscriptions (
				id, org_id, stripe_id, created_at, env,
				current_period_start, current_period_end, billing_cycle_anchor_seconds
			)
			SELECT
				${BENCH_SUBSCRIPTION_PREFIX} || i,
				${org.id},
				${BENCH_STRIPE_SUBSCRIPTION_PREFIX} || i,
				${startsAt},
				${BENCH_ENV},
				${now}::bigint - (i % 30) * ${DAY_MS}::bigint,
				${now}::bigint - (i % 30) * ${DAY_MS}::bigint + ${APPROX_MONTH_MS}::bigint,
				((${startsAt}) / 1000)::bigint
			FROM ${series}
			ON CONFLICT DO NOTHING
		`);
	}
};

const main = async () => {
	const { customers, chunk, reset } = parseArgs();
	const bench = await getBenchContext();
	const { ctx, org } = bench;
	const { db } = ctx;

	if (reset) {
		console.log(
			"bench: deleting seeded rows (slow at large N — prefer re-branching)",
		);
		const internalPrefix = `${BENCH_INTERNAL_CUSTOMER_PREFIX}%`;
		await db.execute(
			sql`DELETE FROM customer_entitlements WHERE internal_customer_id LIKE ${internalPrefix}`,
		);
		await db.execute(
			sql`DELETE FROM customer_prices WHERE internal_customer_id LIKE ${internalPrefix}`,
		);
		await db.execute(
			sql`DELETE FROM customer_products WHERE internal_customer_id LIKE ${internalPrefix}`,
		);
		await db.execute(
			sql`DELETE FROM subscriptions WHERE org_id = ${org.id} AND stripe_id LIKE ${`${BENCH_STRIPE_SUBSCRIPTION_PREFIX}%`}`,
		);
		await db.execute(
			sql`DELETE FROM customers WHERE org_id = ${org.id} AND internal_id LIKE ${internalPrefix}`,
		);
		console.log("bench: reset done");
		process.exit(0);
	}

	const now = Date.now();
	console.log(
		`bench: seeding ${customers.toLocaleString()} customers into org ${org.slug} (chunk ${chunk.toLocaleString()})`,
	);

	const startedAt = Date.now();
	let rangeStart = 1;
	for (const shape of SHAPES) {
		const count = Math.floor(customers * shape.fraction);
		const rangeEnd = rangeStart + count - 1;
		console.log(
			`bench: shape ${shape.key} → customers ${rangeStart.toLocaleString()}..${rangeEnd.toLocaleString()}`,
		);

		for (let start = rangeStart; start <= rangeEnd; start += chunk) {
			const end = Math.min(start + chunk - 1, rangeEnd);
			const chunkStartedAt = Date.now();
			await seedShapeChunk({ bench, shape, start, end, now });
			console.log(
				`bench:   ${shape.key} ${end.toLocaleString()}/${rangeEnd.toLocaleString()} (${Date.now() - chunkStartedAt}ms)`,
			);
		}
		rangeStart = rangeEnd + 1;
	}

	console.log("bench: running ANALYZE");
	await db.execute(
		sql`ANALYZE customers, customer_products, customer_entitlements, customer_prices, subscriptions`,
	);

	const totalSeconds = Math.round((Date.now() - startedAt) / 1000);
	console.log(`bench: done in ${totalSeconds}s`);
	process.exit(0);
};

await main();
