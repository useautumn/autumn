import "dotenv/config";
import {
	AppEnv,
	CouponDurationType,
	entitlements as entitlementsTable,
	features as featuresTable,
	prices as pricesTable,
	RewardType,
	rewards as rewardsTable,
	schemas,
} from "@autumn/shared";
import { and, desc, eq, like, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { loadLocalEnv } from "../src/utils/envUtils";

loadLocalEnv();

const { initDrizzle } = await import("../src/db/initDrizzle");
const { rewardToEntitlementRows } = await import(
	"../src/internal/rewards/repos/rewardEntitlementRows"
);

// Temporary stress test for rewards.list — DB-side EXPLAIN ANALYZE of the
// rewards findMany (with entitlements join) that backs rewardRepo.listApiRewards.
// Compares the LIMIT 100 (shipped) query against an UNLIMITED variant.
//
//   bun run experiments/stressListRewards.ts
//   STRESS_NS="1,100,1000,5000" bun run experiments/stressListRewards.ts

const SEED_PREFIX = "stress-rew-";
const FEATURE_GRANTS_PER_BUCKET = 20;
const SCOPED_COUPONS = 10;
const EXPLAIN_REPS = 6;
const CHUNK = 500;
const CAP = 100;

const NS = (process.env.STRESS_NS ?? "1,10,50,100,250,500,1000")
	.split(",")
	.map((n) => Number.parseInt(n.trim(), 10))
	.filter((n) => Number.isFinite(n) && n > 0);

const median = (xs: number[]) =>
	[...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

// Capture the exact SQL Drizzle emits for the relational findMany (org/env +
// entitlements join + order by), optionally with a LIMIT.
const captureFindManySql = async ({
	pool,
	orgId,
	env,
	limit,
}: {
	pool: pg.Pool;
	orgId: string;
	env: AppEnv;
	limit?: number;
}) => {
	const captured: { query: string; params: unknown[] }[] = [];
	const loggedDb = drizzle(pool, {
		schema: schemas,
		logger: { logQuery: (query, params) => captured.push({ query, params }) },
	});
	await loggedDb.query.rewards.findMany({
		where: and(eq(rewardsTable.org_id, orgId), eq(rewardsTable.env, env)),
		with: { entitlements: true },
		orderBy: [desc(rewardsTable.internal_id)],
		...(limit ? { limit } : {}),
	});
	const hit =
		captured.find((q) => /from\s+"?rewards"?/i.test(q.query)) ?? captured[0];
	if (!hit) throw new Error("Could not capture rewards findMany SQL");
	return hit;
};

// Run EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) and pull execution/planning time
// plus the scan node used on the `rewards` table.
const explainAnalyze = async ({
	pool,
	query,
	params,
}: {
	pool: pg.Pool;
	query: string;
	params: unknown[];
}) => {
	const res = await pool.query(
		`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}`,
		params as unknown[],
	);
	const raw = (res.rows[0] as Record<string, unknown>)["QUERY PLAN"];
	const parsed = (typeof raw === "string" ? JSON.parse(raw) : raw) as Array<{
		Plan: Record<string, unknown>;
		"Planning Time": number;
		"Execution Time": number;
	}>;
	const top = parsed[0];

	let rewardsScan = "?";
	const walk = (node: Record<string, unknown>) => {
		const rel = node["Relation Name"];
		if (rel === "rewards") {
			rewardsScan = `${node["Node Type"]}${node["Index Name"] ? ` (${node["Index Name"]})` : ""}`;
		}
		const kids = (node.Plans as Record<string, unknown>[] | undefined) ?? [];
		for (const k of kids) walk(k);
	};
	walk(top.Plan);

	return {
		execMs: top["Execution Time"],
		planMs: top["Planning Time"],
		rewardsScan,
	};
};

const main = async () => {
	const { db } = initDrizzle();
	const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

	const featureOwner = await db
		.select({ orgId: featuresTable.org_id, env: featuresTable.env })
		.from(featuresTable)
		.limit(1);
	if (featureOwner.length === 0) throw new Error("No features in DB.");
	const orgId = featureOwner[0].orgId as string;
	const env = (featureOwner[0].env as AppEnv) ?? AppEnv.Sandbox;

	const featureRow = await db
		.select({ internalId: featuresTable.internal_id })
		.from(featuresTable)
		.where(and(eq(featuresTable.org_id, orgId), eq(featuresTable.env, env)))
		.limit(1);
	const featureInternalId = featureRow[0].internalId as string;

	const priceRows = await db
		.select({ id: pricesTable.id })
		.from(pricesTable)
		.where(eq(pricesTable.org_id, orgId))
		.limit(SCOPED_COUPONS);
	const realPriceIds = priceRows.map((p) => p.id);

	const baselineRow = await db
		.select({ c: sql<number>`count(*)::int` })
		.from(rewardsTable)
		.where(and(eq(rewardsTable.org_id, orgId), eq(rewardsTable.env, env)));
	const baseline = baselineRow[0]?.c ?? 0;

	console.log(
		`org=${orgId} env=${env} | baseline=${baseline} | realPrices=${realPriceIds.length}\n`,
	);

	// Capture both SQL variants once (params/shape don't change across N).
	const cappedSql = await captureFindManySql({ pool, orgId, env, limit: CAP });
	const unlimitedSql = await captureFindManySql({ pool, orgId, env });

	const cleanup = async () => {
		await db
			.delete(rewardsTable)
			.where(
				and(
					eq(rewardsTable.org_id, orgId),
					eq(rewardsTable.env, env),
					like(rewardsTable.id, `${SEED_PREFIX}%`),
				),
			);
	};

	const seed = async (total: number) => {
		const fgCount = Math.min(FEATURE_GRANTS_PER_BUCKET, total);
		const couponCount = total - fgCount;
		const couponRows = Array.from({ length: couponCount }, (_, i) => {
			const scoped = i < SCOPED_COUPONS && realPriceIds.length > 0;
			return {
				internal_id: `${SEED_PREFIX}c-${i}-${Math.random().toString(36).slice(2, 8)}`,
				id: `${SEED_PREFIX}coupon-${i}`,
				org_id: orgId,
				env,
				created_at: Date.now(),
				name: `Stress Coupon ${i}`,
				type: RewardType.PercentageDiscount,
				promo_codes: [{ code: `STRESSC${i}`, global_max_redemption: 100 }],
				discount_config: {
					discount_value: 10,
					duration_type: CouponDurationType.Months,
					duration_value: 3,
					apply_to_all: !scoped,
					price_ids: scoped ? realPriceIds : [],
				},
			};
		});
		for (let i = 0; i < couponRows.length; i += CHUNK) {
			await db.insert(rewardsTable).values(couponRows.slice(i, i + CHUNK));
		}
		const fgRows = Array.from({ length: fgCount }, (_, i) => ({
			internal_id: `${SEED_PREFIX}fg-${i}-${Math.random().toString(36).slice(2, 8)}`,
			id: `${SEED_PREFIX}grant-${i}`,
			org_id: orgId,
			env,
			created_at: Date.now(),
			name: `Stress Grant ${i}`,
			type: RewardType.FeatureGrant,
			promo_codes: [{ code: `STRESSG${i}`, max_redemptions: 50 }],
		}));
		if (fgRows.length > 0) {
			await db.insert(rewardsTable).values(fgRows);
			const entRows = fgRows.flatMap((reward) =>
				rewardToEntitlementRows({
					reward: {
						...reward,
						entitlements: [
							{ internal_feature_id: featureInternalId, allowance: 1000 },
						],
					},
				}),
			);
			for (let i = 0; i < entRows.length; i += CHUNK) {
				await db.insert(entitlementsTable).values(entRows.slice(i, i + CHUNK));
			}
		}
	};

	const results: Record<string, number | string>[] = [];
	try {
		for (const total of NS) {
			await cleanup();
			await seed(total);

			const explainBoth = async (q: { query: string; params: unknown[] }) => {
				const samples: number[] = [];
				let planMs = 0;
				let scan = "?";
				for (let i = 0; i < EXPLAIN_REPS; i++) {
					const r = await explainAnalyze({ pool, query: q.query, params: q.params });
					samples.push(r.execMs);
					planMs = r.planMs;
					scan = r.rewardsScan;
				}
				return { exec: median(samples), planMs, scan };
			};

			const capped = await explainBoth(cappedSql);
			const unlimited = await explainBoth(unlimitedSql);

			results.push({
				"n (seeded)": total,
				"org total": baseline + total,
				"capped exec ms": +capped.exec.toFixed(3),
				"UNLIMITED exec ms": +unlimited.exec.toFixed(3),
				"plan ms": +unlimited.planMs.toFixed(3),
				"rewards scan": unlimited.scan,
			});
			console.log(
				`n=${total}: capped ${capped.exec.toFixed(2)}ms | unlimited ${unlimited.exec.toFixed(2)}ms | ${unlimited.scan}`,
			);
		}
	} finally {
		await cleanup();
		console.log("\nCleaned up seeded rewards.\n");
	}

	console.log(
		`\n=== rewards findMany — EXPLAIN ANALYZE exec time (median of ${EXPLAIN_REPS}), env=${env} ===`,
	);
	console.table(results);
	await pool.end();
	process.exit(0);
};

await main();
