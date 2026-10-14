import { sql } from "drizzle-orm";
import { initDrizzle } from "../src/db/initDrizzle";
import {
	initMotherDuck,
	type MotherDuckDb,
} from "../src/external/motherduck/initMotherDuck";

const FEATURE_INTERNAL_ID =
	process.env.PROD_TEST_FEATURE_INTERNAL_ID ?? "fe_3AqPX5NFZfG2LF7U1k0TQb0TPg2";
const SMALL_FEATURE_INTERNAL_ID =
	process.env.PROD_TEST_SMALL_FEATURE_INTERNAL_ID ??
	"fe_3ErCQiGdoMoHsa4ty9DCBiptxbW";
const NOMINATION_LIMIT = 1000;
const VERIFY_PAGE_SIZE = 250;
const REPEATS = 10;
const BURST_SIZE = 8;
const POOL_SIZE = 4;

const p50 = (xs: number[]): number =>
	[...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const p95 = (xs: number[]): number =>
	[...xs].sort((a, b) => a - b)[
		Math.min(xs.length - 1, Math.floor(xs.length * 0.95))
	];

const nominationSql = (featureInternalId: string) => sql`
	SELECT internal_customer_id, BOOL_OR(unlimited) AS is_unlimited, SUM(balance) AS total
	FROM main.ce_balances
	WHERE internal_feature_id = ${featureInternalId}
		AND (expires_at IS NULL OR expires_at > epoch_ms(now()))
	GROUP BY 1
	ORDER BY is_unlimited DESC, total DESC
	LIMIT ${NOMINATION_LIMIT}
`;

type NominationRow = {
	internal_customer_id: string;
	is_unlimited: boolean;
	total: number | string;
};

const rowsOf = <T>(result: unknown): T[] => {
	if (Array.isArray(result)) return result as T[];
	if (result && typeof result === "object" && "rows" in result) {
		return (result as { rows: T[] }).rows;
	}
	return [];
};

const runNomination = async ({
	db,
	featureInternalId,
}: {
	db: MotherDuckDb;
	featureInternalId: string;
}): Promise<NominationRow[]> =>
	rowsOf<NominationRow>(await db.execute(nominationSql(featureInternalId)));

const main = async () => {
	if (!process.env.MOTHERDUCK_TOKEN) {
		throw new Error("MOTHERDUCK_TOKEN env var is required");
	}

	console.log("=== MOTHERDUCK NOMINATION BENCHMARK ===");
	console.log(
		JSON.stringify(
			{ FEATURE_INTERNAL_ID, NOMINATION_LIMIT, REPEATS, BURST_SIZE, POOL_SIZE },
			null,
			2,
		),
	);

	const tColdStart = performance.now();
	const md = await initMotherDuck({
		token: process.env.MOTHERDUCK_TOKEN,
		poolSize: POOL_SIZE,
	});
	const tInitDone = performance.now();
	await md.execute(sql`SELECT 1`);
	const tFirstQuery = performance.now();
	console.log(
		`\nA: cold start — init=${(tInitDone - tColdStart).toFixed(0)}ms firstQuery=${(tFirstQuery - tInitDone).toFixed(0)}ms total=${(tFirstQuery - tColdStart).toFixed(0)}ms`,
	);

	{
		await runNomination({ db: md, featureInternalId: FEATURE_INTERNAL_ID });
		const samples: number[] = [];
		let rows: NominationRow[] = [];
		for (let i = 0; i < REPEATS; i++) {
			const t0 = performance.now();
			rows = await runNomination({
				db: md,
				featureInternalId: FEATURE_INTERNAL_ID,
			});
			samples.push(performance.now() - t0);
		}
		console.log(
			`\nB: warm nomination (whale) — rows=${rows.length} p50=${p50(samples).toFixed(0)}ms p95=${p95(samples).toFixed(0)}ms min=${Math.min(...samples).toFixed(0)}ms (${REPEATS} repeats)`,
		);
		console.log(
			`   top=${rows[0]?.total} cutoff=${rows[rows.length - 1]?.total}`,
		);
	}

	const totalsSql = (featureInternalId: string) => sql`
		SELECT internal_customer_id, is_unlimited, total
		FROM main.ce_balance_totals
		WHERE internal_feature_id = ${featureInternalId}
		ORDER BY is_unlimited DESC, total DESC
		LIMIT ${NOMINATION_LIMIT}
	`;
	let totalsTableExists = true;
	try {
		await md.execute(sql`SELECT 1 FROM main.ce_balance_totals LIMIT 1`);
	} catch {
		totalsTableExists = false;
		console.log(
			"\nB2: SKIPPED — main.ce_balance_totals missing; run runCacheRefreshOnce.ts first",
		);
	}
	if (totalsTableExists) {
		await md.execute(totalsSql(FEATURE_INTERNAL_ID));
		const samples: number[] = [];
		let rows: NominationRow[] = [];
		for (let i = 0; i < REPEATS; i++) {
			const t0 = performance.now();
			rows = rowsOf<NominationRow>(
				await md.execute(totalsSql(FEATURE_INTERNAL_ID)),
			);
			samples.push(performance.now() - t0);
		}
		console.log(
			`\nB2: warm nomination via ce_balance_totals — rows=${rows.length} p50=${p50(samples).toFixed(0)}ms p95=${p95(samples).toFixed(0)}ms min=${Math.min(...samples).toFixed(0)}ms (${REPEATS} repeats)`,
		);
	}

	{
		const burstQuery = totalsTableExists
			? () => md.execute(totalsSql(FEATURE_INTERNAL_ID))
			: () => runNomination({ db: md, featureInternalId: FEATURE_INTERNAL_ID });
		const t0 = performance.now();
		const outcomes = await Promise.all(
			Array.from({ length: BURST_SIZE }, async () => {
				const tq = performance.now();
				try {
					await burstQuery();
					return { ms: performance.now() - tq, shed: false };
				} catch {
					return { ms: performance.now() - tq, shed: true };
				}
			}),
		);
		const ok = outcomes.filter((o) => !o.shed).map((o) => o.ms);
		const sheds = outcomes.length - ok.length;
		console.log(
			`\nC: burst ${BURST_SIZE} concurrent on pool ${POOL_SIZE} (${totalsTableExists ? "totals" : "raw"} query) — wall=${(performance.now() - t0).toFixed(0)}ms ok=${ok.length} shed=${sheds}${ok.length ? ` perQuery p50=${p50(ok).toFixed(0)}ms p95=${p95(ok).toFixed(0)}ms` : ""}`,
		);
	}

	{
		await runNomination({
			db: md,
			featureInternalId: SMALL_FEATURE_INTERNAL_ID,
		});
		const samples: number[] = [];
		for (let i = 0; i < 5; i++) {
			const t0 = performance.now();
			await runNomination({
				db: md,
				featureInternalId: SMALL_FEATURE_INTERNAL_ID,
			});
			samples.push(performance.now() - t0);
		}
		console.log(
			`\nD: warm nomination (small feature) — p50=${p50(samples).toFixed(0)}ms (5 repeats)`,
		);
	}

	{
		const usingReplica = Boolean(process.env.DATABASE_REPLICA_URL);
		const { db: pg, client } = initDrizzle({ replica: usingReplica });

		const samples: { nominate: number; verify: number }[] = [];
		for (let i = 0; i < 5; i++) {
			const t0 = performance.now();
			const nominations = totalsTableExists
				? rowsOf<NominationRow>(await md.execute(totalsSql(FEATURE_INTERNAL_ID)))
				: await runNomination({
						db: md,
						featureInternalId: FEATURE_INTERNAL_ID,
					});
			const t1 = performance.now();

			const pageIds = nominations
				.slice(0, VERIFY_PAGE_SIZE)
				.map((row) => row.internal_customer_id);
			const verified = await pg.execute<{
				internal_customer_id: string;
				total: string | number;
			}>(sql`
				SELECT ce.internal_customer_id, SUM(ce.balance) AS total
				FROM customer_entitlements ce
				WHERE ce.internal_customer_id IN (${sql.join(
					pageIds.map((id) => sql`${id}`),
					sql`, `,
				)})
					AND ce.internal_feature_id = ${FEATURE_INTERNAL_ID}
					AND ce.expired IS NOT TRUE
					AND (ce.expires_at IS NULL OR ce.expires_at > EXTRACT(EPOCH FROM now()) * 1000)
					AND ce.pooled_contribution_id IS NULL
				GROUP BY ce.internal_customer_id
			`);
			const t2 = performance.now();
			samples.push({ nominate: t1 - t0, verify: t2 - t1 });
			if (i === 0) {
				console.log(
					`\nE: end-to-end sample — nominated=${nominations.length} verified=${verified.length} (page of ${VERIFY_PAGE_SIZE})`,
				);
			}
		}
		console.log(
			`E: p50 — nominate=${p50(samples.map((s) => s.nominate)).toFixed(0)}ms verify=${p50(samples.map((s) => s.verify)).toFixed(0)}ms total≈${(
				p50(samples.map((s) => s.nominate)) +
				p50(samples.map((s) => s.verify))
			).toFixed(0)}ms  (PG-only baseline for this sort: ~6500ms)`,
		);

		await client.end();
	}

	await md.close();
	console.log("\n✅ Done");
	process.exit(0);
};

await main();
