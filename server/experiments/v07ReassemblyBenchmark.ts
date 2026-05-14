import chalk from "chalk";
import { sql, type SQL } from "drizzle-orm";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { initDrizzle } from "../src/db/initDrizzle";
import { loadLocalEnv } from "../src/utils/envUtils";

loadLocalEnv();

const ORG_ID = "biu9vSF7vghBLSKW1UTDwxHBAivjnPaK";
const ENV = "live";
const LABEL = "firecrawl-deep";
const LIMIT = 1000;
const FETCH_LIMIT = LIMIT + 1;
const SQL_REPEATS = 1;
const REASSEMBLY_REPEATS = 20;
const STATEMENT_TIMEOUT_MS = 30_000;
const DEEP_CURSOR = {
	t: 1774237983361,
	id: "772c9569-fc97-4c30-9fd8-c8a585b66755",
};

const RESULTS_DIR = join(import.meta.dir, "results");

type DB = ReturnType<typeof initDrizzle>["db"];

const buildVariant07Sql = (): SQL => sql`
WITH cr AS MATERIALIZED (
  SELECT
    c.internal_id,
    c.id,
    c.created_at,
    row_to_json(c) AS row_json
  FROM customers c
  WHERE c.org_id = ${ORG_ID}
    AND c.env = ${ENV}
    AND (c.created_at, c.id) < (${DEEP_CURSOR.t}, ${DEEP_CURSOR.id})
  ORDER BY c.created_at DESC, c.id DESC
  LIMIT ${FETCH_LIMIT}
),
cps_flat AS MATERIALIZED (
  SELECT
    cp.id,
    cp.internal_customer_id,
    cp.internal_product_id,
    cp.free_trial_id,
    cp.subscription_ids,
    (row_to_json(cp)::jsonb || jsonb_build_object('product', row_to_json(prod)))::json AS row_json
  FROM cr
  JOIN LATERAL (
    SELECT cp.*
    FROM customer_products cp
    WHERE cp.internal_customer_id = cr.internal_id
      AND cp.status = ANY(ARRAY['active', 'past_due', 'scheduled'])
    ORDER BY cp.created_at DESC
    LIMIT 15
  ) cp ON true
  JOIN products prod ON cp.internal_product_id = prod.internal_id
),
ces_combined AS MATERIALIZED (
  SELECT 'bound'::text AS kind, ce.id, ce.entitlement_id, row_to_json(ce) AS row_json
  FROM cps_flat
  JOIN LATERAL (
    SELECT ce.*
    FROM customer_entitlements ce
    WHERE ce.customer_product_id = cps_flat.id
  ) ce ON true
  UNION ALL
  SELECT 'loose'::text AS kind, ce.id, ce.entitlement_id, row_to_json(ce) AS row_json
  FROM cr
  JOIN LATERAL (
    SELECT ce.*
    FROM customer_entitlements ce
    WHERE ce.internal_customer_id = cr.internal_id
      AND ce.customer_product_id IS NULL
      AND (ce.expires_at IS NULL OR ce.expires_at > EXTRACT(EPOCH FROM now()) * 1000)
    ORDER BY ce.id DESC
    LIMIT 30
  ) ce ON true
),
arrays AS MATERIALIZED (
  SELECT
    (SELECT array_agg(id) FROM ces_combined) AS all_ce_ids,
    (SELECT array_agg(DISTINCT entitlement_id) FROM ces_combined) AS distinct_entitlement_ids,
    (SELECT array_agg(DISTINCT free_trial_id) FILTER (WHERE free_trial_id IS NOT NULL) FROM cps_flat) AS free_trial_ids
)
SELECT
  (SELECT COALESCE(json_agg(row_json), '[]'::json) FROM cr) AS customers,
  (SELECT COALESCE(json_agg(row_json), '[]'::json) FROM cps_flat) AS customer_products,
  (SELECT COALESCE(json_agg(row_json), '[]'::json) FROM ces_combined WHERE kind = 'bound') AS customer_entitlements,
  (SELECT COALESCE(json_agg(row_json), '[]'::json) FROM ces_combined WHERE kind = 'loose') AS extra_customer_entitlements,
  (SELECT COALESCE(json_agg(row_to_json(cpr)::jsonb || jsonb_build_object('price', row_to_json(p))), '[]'::json)
   FROM cps_flat cps
   JOIN LATERAL (SELECT cpr.* FROM customer_prices cpr WHERE cpr.customer_product_id = cps.id) cpr ON true
   LEFT JOIN LATERAL (SELECT p.* FROM prices p WHERE p.id = cpr.price_id) p ON true) AS customer_prices,
  (SELECT COALESCE(json_agg(row_to_json(e)::jsonb || jsonb_build_object('feature', row_to_json(f))), '[]'::json)
   FROM unnest((SELECT distinct_entitlement_ids FROM arrays)) AS u(entitlement_id)
   JOIN LATERAL (SELECT e.* FROM entitlements e WHERE e.id = u.entitlement_id) e ON true
   JOIN LATERAL (SELECT f.* FROM features f WHERE f.internal_id = e.internal_feature_id) f ON true) AS entitlements,
  (SELECT COALESCE(json_agg(row_to_json(ro)), '[]'::json)
   FROM unnest((SELECT all_ce_ids FROM arrays)) AS u(ce_id)
   JOIN LATERAL (SELECT ro.* FROM rollovers ro WHERE ro.cus_ent_id = u.ce_id AND (ro.expires_at IS NULL OR ro.expires_at > EXTRACT(EPOCH FROM now()) * 1000)) ro ON true) AS rollovers,
  (SELECT COALESCE(json_agg(row_to_json(r)), '[]'::json)
   FROM unnest((SELECT all_ce_ids FROM arrays)) AS u(ce_id)
   JOIN LATERAL (SELECT r.* FROM replaceables r WHERE r.cus_ent_id = u.ce_id) r ON true) AS replaceables,
  (SELECT COALESCE(json_agg(row_to_json(ft)), '[]'::json)
   FROM unnest((SELECT free_trial_ids FROM arrays)) AS u(ft_id)
   JOIN LATERAL (SELECT ft.* FROM free_trials ft WHERE ft.id = u.ft_id) ft ON true) AS free_trials,
  (SELECT COALESCE(json_agg(row_to_json(s)), '[]'::json)
   FROM (
     SELECT DISTINCT s.*
     FROM cps_flat cps
     CROSS JOIN LATERAL unnest(cps.subscription_ids) AS sub_id_t(sub_id)
     JOIN LATERAL (SELECT s.* FROM subscriptions s WHERE s.stripe_id = sub_id_t.sub_id) s ON true
     WHERE cps.subscription_ids IS NOT NULL
   ) s) AS subscriptions
`;

type V07Row = {
	customers: any[];
	customer_products: any[];
	customer_entitlements: any[];
	extra_customer_entitlements: any[];
	customer_prices: any[];
	entitlements: any[];
	rollovers: any[];
	replaceables: any[];
	free_trials: any[];
	subscriptions: any[];
};

const reassemble = (flat: V07Row) => {
	const {
		customers,
		customer_products,
		customer_entitlements,
		extra_customer_entitlements,
		customer_prices,
		entitlements,
		rollovers,
		replaceables,
		free_trials,
		subscriptions,
	} = flat;

	const entById = new Map<string, any>();
	for (const e of entitlements) entById.set(e.id, e);

	const ftById = new Map<string, any>();
	for (const ft of free_trials) ftById.set(ft.id, ft);

	const subByStripeId = new Map<string, any>();
	for (const s of subscriptions) subByStripeId.set(s.stripe_id, s);

	const rolloversByCeId = new Map<string, any[]>();
	for (const ro of rollovers) {
		const list = rolloversByCeId.get(ro.cus_ent_id);
		if (list) list.push(ro);
		else rolloversByCeId.set(ro.cus_ent_id, [ro]);
	}

	const replaceablesByCeId = new Map<string, any[]>();
	for (const r of replaceables) {
		const list = replaceablesByCeId.get(r.cus_ent_id);
		if (list) list.push(r);
		else replaceablesByCeId.set(r.cus_ent_id, [r]);
	}

	const cpricesByCpId = new Map<string, any[]>();
	for (const cpr of customer_prices) {
		const list = cpricesByCpId.get(cpr.customer_product_id);
		if (list) list.push(cpr);
		else cpricesByCpId.set(cpr.customer_product_id, [cpr]);
	}

	const hydrateCe = (ce: any) => ({
		...ce,
		entitlement: entById.get(ce.entitlement_id) ?? null,
		rollovers: rolloversByCeId.get(ce.id) ?? [],
		replaceables: replaceablesByCeId.get(ce.id) ?? [],
	});

	const cesByCpId = new Map<string, any[]>();
	for (const ce of customer_entitlements) {
		const hydrated = hydrateCe(ce);
		const list = cesByCpId.get(ce.customer_product_id);
		if (list) list.push(hydrated);
		else cesByCpId.set(ce.customer_product_id, [hydrated]);
	}

	const looseCesByCusId = new Map<string, any[]>();
	for (const ce of extra_customer_entitlements) {
		const hydrated = hydrateCe(ce);
		const list = looseCesByCusId.get(ce.internal_customer_id);
		if (list) list.push(hydrated);
		else looseCesByCusId.set(ce.internal_customer_id, [hydrated]);
	}

	const cpsByCusId = new Map<string, any[]>();
	for (const cp of customer_products) {
		const hydrated = {
			...cp,
			customer_prices: cpricesByCpId.get(cp.id) ?? [],
			customer_entitlements: cesByCpId.get(cp.id) ?? [],
			free_trial: cp.free_trial_id ? (ftById.get(cp.free_trial_id) ?? null) : null,
		};
		const list = cpsByCusId.get(cp.internal_customer_id);
		if (list) list.push(hydrated);
		else cpsByCusId.set(cp.internal_customer_id, [hydrated]);
	}

	const subsByCusId = new Map<string, any[]>();
	for (const cp of customer_products) {
		if (!cp.subscription_ids?.length) continue;
		const existing = subsByCusId.get(cp.internal_customer_id) ?? [];
		const seen = new Set(existing.map((s: any) => s.stripe_id));
		for (const subId of cp.subscription_ids) {
			if (seen.has(subId)) continue;
			const sub = subByStripeId.get(subId);
			if (sub) {
				existing.push(sub);
				seen.add(subId);
			}
		}
		if (existing.length) subsByCusId.set(cp.internal_customer_id, existing);
	}

	const result: any[] = [];
	for (const c of customers) {
		result.push({
			...c,
			customer_products: cpsByCusId.get(c.internal_id) ?? [],
			extra_customer_entitlements: looseCesByCusId.get(c.internal_id) ?? [],
			subscriptions: subsByCusId.get(c.internal_id) ?? [],
		});
	}
	return result;
};

const runQueryInTxn = async ({
	db,
	query,
}: {
	db: DB;
	query: SQL;
}): Promise<Record<string, unknown>[]> => {
	return await db.transaction(async (tx) => {
		await tx.execute(
			sql.raw(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`),
		);
		await tx.execute(sql.raw("SET LOCAL transaction_read_only = on"));
		const result = await tx.execute(query);
		return result as unknown as Record<string, unknown>[];
	});
};

const summarise = (samples: number[]) => {
	const sorted = [...samples].sort((a, b) => a - b);
	return {
		min: sorted[0] ?? 0,
		median: sorted[Math.floor(sorted.length / 2)] ?? 0,
		p95: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0,
		max: sorted[sorted.length - 1] ?? 0,
		samples: sorted,
	};
};

const main = async () => {
	console.log(
		chalk.magentaBright(
			`\n================ Variant 07 + Reassembly Benchmark — ${LABEL} ================\n`,
		),
	);

	const { db, client } = initDrizzle();

	try {
		console.log(chalk.cyan(`Org: ${ORG_ID} (${ENV})`));
		console.log(
			chalk.cyan(
				`Deep cursor: t=${DEEP_CURSOR.t} id=${DEEP_CURSOR.id} limit=${LIMIT}\n`,
			),
		);

		// Step 1 — EXPLAIN ANALYZE pass for server-side SQL execution time
		console.log(chalk.cyan("[1/3] EXPLAIN (ANALYZE, FORMAT JSON) — server-side ms"));
		const explainSamples: number[] = [];
		let lastExplainPlan: any = null;
		for (let i = 0; i < SQL_REPEATS; i++) {
			const explainRows = await runQueryInTxn({
				db,
				query: sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${buildVariant07Sql()}`,
			});
			const plan = (explainRows[0] as { "QUERY PLAN": any })["QUERY PLAN"];
			const planObj = Array.isArray(plan) ? plan[0] : plan;
			const execTime = planObj["Execution Time"] as number;
			explainSamples.push(execTime);
			lastExplainPlan = planObj;
			process.stdout.write(chalk.gray(`  run ${i + 1}: ${execTime.toFixed(2)}ms\n`));
		}
		const sqlSummary = summarise(explainSamples);

		// Step 2 — actual query to capture rows for reassembly
		console.log(chalk.cyan("\n[2/3] Executing variant 07 to capture row payload"));
		const queryStart = performance.now();
		const rows = await runQueryInTxn({ db, query: buildVariant07Sql() });
		const queryWallMs = performance.now() - queryStart;
		const flatRow = rows[0] as unknown as V07Row;

		const counts = {
			customers: flatRow.customers?.length ?? 0,
			customer_products: flatRow.customer_products?.length ?? 0,
			customer_entitlements: flatRow.customer_entitlements?.length ?? 0,
			extra_customer_entitlements: flatRow.extra_customer_entitlements?.length ?? 0,
			customer_prices: flatRow.customer_prices?.length ?? 0,
			entitlements: flatRow.entitlements?.length ?? 0,
			rollovers: flatRow.rollovers?.length ?? 0,
			replaceables: flatRow.replaceables?.length ?? 0,
			free_trials: flatRow.free_trials?.length ?? 0,
			subscriptions: flatRow.subscriptions?.length ?? 0,
		};
		console.log(
			chalk.gray(`  client-side wall (incl. UK→US network): ${queryWallMs.toFixed(2)}ms`),
		);
		console.log(chalk.gray(`  row counts: ${JSON.stringify(counts)}`));

		const payloadBytes = Buffer.byteLength(JSON.stringify(flatRow), "utf8");
		console.log(
			chalk.gray(`  payload size: ${(payloadBytes / 1024 / 1024).toFixed(2)} MB`),
		);

		// Step 3 — reassembly benchmark (pure JS, in-memory)
		console.log(
			chalk.cyan(`\n[3/3] Reassembly benchmark — ${REASSEMBLY_REPEATS} runs`),
		);
		// Warm up the JIT
		for (let i = 0; i < 3; i++) reassemble(flatRow);
		const reassemblySamples: number[] = [];
		let lastReassembledLen = 0;
		for (let i = 0; i < REASSEMBLY_REPEATS; i++) {
			const start = performance.now();
			const reassembled = reassemble(flatRow);
			const elapsed = performance.now() - start;
			reassemblySamples.push(elapsed);
			lastReassembledLen = reassembled.length;
		}
		const reassemblySummary = summarise(reassemblySamples);
		console.log(
			chalk.gray(
				`  reassembled ${lastReassembledLen} FullCustomers (${REASSEMBLY_REPEATS} runs)`,
			),
		);

		// Report
		console.log(chalk.magentaBright("\n================ RESULTS ================\n"));
		console.log(chalk.bold("SQL (server-side, EXPLAIN ANALYZE Execution Time):"));
		console.log(
			`  min=${sqlSummary.min.toFixed(2)}ms  median=${sqlSummary.median.toFixed(2)}ms  p95=${sqlSummary.p95.toFixed(2)}ms  max=${sqlSummary.max.toFixed(2)}ms`,
		);
		console.log(chalk.gray(`  samples: ${sqlSummary.samples.map((s) => s.toFixed(1)).join(", ")}`));
		console.log();
		console.log(chalk.bold("Reassembly (JS, in-memory, network-free):"));
		console.log(
			`  min=${reassemblySummary.min.toFixed(2)}ms  median=${reassemblySummary.median.toFixed(2)}ms  p95=${reassemblySummary.p95.toFixed(2)}ms  max=${reassemblySummary.max.toFixed(2)}ms`,
		);
		console.log(chalk.gray(`  samples: ${reassemblySummary.samples.map((s) => s.toFixed(2)).join(", ")}`));
		console.log();
		console.log(chalk.bold.green("Total (network-free) median:"));
		console.log(
			chalk.bold.green(
				`  ${(sqlSummary.median + reassemblySummary.median).toFixed(2)}ms = ${sqlSummary.median.toFixed(2)}ms SQL + ${reassemblySummary.median.toFixed(2)}ms reassembly`,
			),
		);
		console.log();
		console.log(chalk.bold("Reference (UK→US client wall, includes ~100ms network):"));
		console.log(`  one-shot db.execute: ${queryWallMs.toFixed(2)}ms`);
		console.log();

		const date = new Date().toISOString().slice(0, 10);
		const reportPath = join(RESULTS_DIR, `${date}-v07-reassembly-${LABEL}.md`);
		const fixturePath = join(RESULTS_DIR, `${date}-v07-fixture-${LABEL}.json`);

		const lines: string[] = [];
		lines.push(`# Variant 07 + JS Reassembly — ${date} — ${LABEL}`);
		lines.push("");
		lines.push("## Config");
		lines.push(`- org_id: \`${ORG_ID}\``);
		lines.push(`- env: \`${ENV}\``);
		lines.push(`- limit: ${LIMIT} (fetch ${FETCH_LIMIT})`);
		lines.push(`- deep cursor: \`{ t: ${DEEP_CURSOR.t}, id: ${DEEP_CURSOR.id} }\``);
		lines.push(`- SQL repeats: ${SQL_REPEATS}`);
		lines.push(`- reassembly repeats: ${REASSEMBLY_REPEATS} (after 3 warmup runs)`);
		lines.push("");
		lines.push("## SQL (server-side, EXPLAIN ANALYZE Execution Time, network-free)");
		lines.push("");
		lines.push(`| min | median | p95 | max |`);
		lines.push(`|---|---|---|---|`);
		lines.push(
			`| ${sqlSummary.min.toFixed(2)}ms | ${sqlSummary.median.toFixed(2)}ms | ${sqlSummary.p95.toFixed(2)}ms | ${sqlSummary.max.toFixed(2)}ms |`,
		);
		lines.push("");
		lines.push(
			`Samples: ${sqlSummary.samples.map((s) => `${s.toFixed(1)}ms`).join(", ")}`,
		);
		lines.push("");
		lines.push("## Reassembly (JS, in-memory)");
		lines.push("");
		lines.push(`| min | median | p95 | max |`);
		lines.push(`|---|---|---|---|`);
		lines.push(
			`| ${reassemblySummary.min.toFixed(2)}ms | ${reassemblySummary.median.toFixed(2)}ms | ${reassemblySummary.p95.toFixed(2)}ms | ${reassemblySummary.max.toFixed(2)}ms |`,
		);
		lines.push("");
		lines.push(
			`Samples: ${reassemblySummary.samples.map((s) => `${s.toFixed(2)}ms`).join(", ")}`,
		);
		lines.push("");
		lines.push("## Total network-free");
		lines.push("");
		lines.push(
			`**${(sqlSummary.median + reassemblySummary.median).toFixed(2)}ms** = ${sqlSummary.median.toFixed(2)}ms SQL + ${reassemblySummary.median.toFixed(2)}ms reassembly`,
		);
		lines.push("");
		lines.push("## Row counts");
		lines.push("");
		lines.push("```json");
		lines.push(JSON.stringify(counts, null, 2));
		lines.push("```");
		lines.push("");
		lines.push(`Payload size: ${(payloadBytes / 1024 / 1024).toFixed(2)} MB`);
		lines.push("");
		lines.push("## Reference: UK→US client wall");
		lines.push("");
		lines.push(`One-shot \`db.execute\`: ${queryWallMs.toFixed(2)}ms`);
		lines.push("");
		lines.push("## Last EXPLAIN plan (JSON)");
		lines.push("");
		lines.push("```json");
		lines.push(JSON.stringify(lastExplainPlan, null, 2));
		lines.push("```");

		writeFileSync(reportPath, lines.join("\n"));
		writeFileSync(fixturePath, JSON.stringify(flatRow));

		console.log(chalk.green(`✅ Report written to ${reportPath}`));
		console.log(chalk.green(`✅ Fixture written to ${fixturePath}`));
		console.log(
			chalk.magentaBright(
				"\n================ Benchmark Complete ================\n",
			),
		);
	} catch (error) {
		console.error(chalk.red("\n❌ Benchmark failed:"));
		console.error(error);
		console.error(chalk.gray(JSON.stringify(error, Object.getOwnPropertyNames(error || {}))));
		process.exit(1);
	} finally {
		await client.end();
		process.exit(0);
	}
};

await main();
