#!/usr/bin/env bun
// One-time backfill of S3 parquet events into Neon (WS4 of EVENTS-NEON-CDC-PLAN.md).
// Requires duckdb + psql CLIs, NEON_DIRECT_URL, BACKFILL_ORGS, EVENTS_S3_BUCKET,
// and ambient AWS credentials.
import { appendFile } from "node:fs/promises";
import { $ } from "bun";
import { Client } from "pg";

// Session-scoped advisory lock: serializes runs so two invocations can't interleave
// TRUNCATE/COPY/MERGE on the shared events_staging table.
const ADVISORY_LOCK_KEY = 741_006_001;

const DEFAULT_FROM_MONTH = "2024-04";
const MONTH_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])$/;
const DONE_FILE = `${import.meta.dir}/.backfill_neon_done`;
const SET_UTC = "SET timezone='UTC'";

// Single source of truth for column order across staging DDL, \copy, and the merge INSERT.
const EVENT_COLUMNS = [
	"id",
	"org_id",
	"org_slug",
	"internal_customer_id",
	"env",
	"created_at",
	'"timestamp"',
	"event_name",
	"idempotency_key",
	"value",
	"set_usage",
	"entity_id",
	"internal_entity_id",
	"internal_product_id",
	"customer_id",
	"properties",
	"deductions",
] as const;
const COLUMN_LIST = EVENT_COLUMNS.join(", ");

const STAGING_DDL = `CREATE TABLE IF NOT EXISTS events_staging (
	id text, org_id text, org_slug text, internal_customer_id text, env text,
	created_at bigint, "timestamp" timestamptz, event_name text, idempotency_key text,
	value numeric, set_usage boolean, entity_id text, internal_entity_id text,
	internal_product_id text, customer_id text, properties jsonb, deductions jsonb
)`;

const copyToStaging = (csvPath: string): string =>
	`\\copy events_staging (${COLUMN_LIST}) FROM '${csvPath}' CSV`;

const MERGE_SQL = `INSERT INTO events (${COLUMN_LIST}) SELECT ${COLUMN_LIST} FROM events_staging ON CONFLICT DO NOTHING`;

// Parquet string columns are un-annotated BYTE_ARRAY -> DuckDB BLOB; decode() (NOT ::VARCHAR,
// which emits an escaped repr) restores clean UTF-8. Dot-commands silence setup banners that
// would otherwise pollute the CSV stream. Tinybird wraps deductions as {list:[...]} while
// live rows store the bare TrackDeduction[] — normalize every historical shape to bare array.
// set_usage is absent from the parquet export; emit false (NOT NULL — readers and the
// partial index filter on set_usage = false, so NULL rows would be silently excluded).
const duckDbExportSql = (
	s3Prefix: string,
	orgId: string,
	year: string,
	month: string,
	outPath: string,
): string => `.output /dev/null
INSTALL httpfs; LOAD httpfs; INSTALL aws; LOAD aws; INSTALL json; LOAD json;
CREATE OR REPLACE SECRET s3_ambient (TYPE s3, PROVIDER credential_chain, REGION 'us-east-2');
.output
COPY (
	SELECT decode(CAST(id AS BLOB)) AS id, decode(CAST(org_id AS BLOB)) AS org_id,
	       COALESCE(decode(CAST(org_slug AS BLOB)),'') AS org_slug,
	       decode(CAST(internal_customer_id AS BLOB)) AS internal_customer_id,
	       COALESCE(decode(CAST(env AS BLOB)),'live') AS env, created_at, "timestamp",
	       decode(CAST(event_name AS BLOB)) AS event_name, decode(CAST(idempotency_key AS BLOB)) AS idempotency_key,
	       value, false AS set_usage,
	       decode(CAST(entity_id AS BLOB)) AS entity_id, decode(CAST(internal_entity_id AS BLOB)) AS internal_entity_id,
	       decode(CAST(internal_product_id AS BLOB)) AS internal_product_id, decode(CAST(customer_id AS BLOB)) AS customer_id,
	       COALESCE(decode(CAST(properties AS BLOB)),'{}') AS properties, CASE
	         WHEN deductions IS NULL OR trim(decode(CAST(deductions AS BLOB))) IN ('', '{}', 'null') THEN '[]'
	         WHEN trim(decode(CAST(deductions AS BLOB))) LIKE '[%' THEN decode(CAST(deductions AS BLOB))
	         ELSE COALESCE(CAST(json_extract(decode(CAST(deductions AS BLOB)), '$.list') AS VARCHAR), '[]')
	       END AS deductions
	FROM read_parquet('${s3Prefix}/org_id=${orgId}/year=${year}/month=${month}/**/*.parquet')
) TO '${outPath}' (FORMAT CSV, HEADER false);
`;

const USAGE = `Backfill S3 parquet events into Neon (events_staging -> events, dedup on conflict).

Usage:
  bun scripts/ops/backfill-events-neon.ts [--org <slug|all>] [--from YYYY-MM] [--to YYYY-MM]

Options:
  --org   an org slug from BACKFILL_ORGS | all   (default: all)
  --from  first month, YYYY-MM   (default: ${DEFAULT_FROM_MONTH})
  --to    last month, YYYY-MM    (default: current month)
  --help  show this help

Env (all required):
  NEON_DIRECT_URL    Neon direct (non-pooled) connection string
  BACKFILL_ORGS      org map, e.g. "acme=org_123,globex=org_456"
  EVENTS_S3_BUCKET   events landing bucket name (reads s3://<bucket>/events/org_id=<id>/...)
  AWS credentials    ambient (env / profile / SSO)

Chunks run per (org, month), newest to oldest. Completed chunks are recorded in
scripts/ops/.backfill_neon_done and skipped on rerun.`;

type CliArgs = { from: string; org: string; to: string };

const fail = (message: string): never => {
	console.error(message);
	process.exit(1);
};

// psql needs an explicit root-cert source for sslmode=verify-full URLs; Node's pg uses
// the system CA store natively, so only the psql-facing URL gets the parameter.
const withSystemRootCert = (url: string): string =>
	url.includes("sslrootcert=")
		? url
		: `${url}${url.includes("?") ? "&" : "?"}sslrootcert=system`;

const currentMonth = (): string => new Date().toISOString().slice(0, 7);

const parseArgs = (argv: string[]): CliArgs => {
	let org = "all";
	let from = DEFAULT_FROM_MONTH;
	let to = currentMonth();
	const rest = [...argv];
	while (rest.length > 0) {
		const flag = rest.shift();
		if (flag === "--help" || flag === "-h") {
			console.log(USAGE);
			process.exit(0);
		}
		const value = rest.shift();
		if (!value) {
			fail(`${flag} requires a value\n\n${USAGE}`);
		}
		if (flag === "--org") {
			org = value;
		} else if (flag === "--from") {
			from = value;
		} else if (flag === "--to") {
			to = value;
		} else {
			fail(`Unknown flag: ${flag}\n\n${USAGE}`);
		}
	}
	if (!(MONTH_PATTERN.test(from) && MONTH_PATTERN.test(to))) {
		fail("--from/--to must be YYYY-MM");
	}
	if (from > to) {
		fail(`--from (${from}) must not be after --to (${to})`);
	}
	return { from, org, to };
};

// Org ids and bucket stay out of source (public repo) — supplied via env.
const loadOrgs = (): Record<string, string> => {
	const raw = process.env.BACKFILL_ORGS;
	if (!raw) {
		fail(`BACKFILL_ORGS env var is required (e.g. "acme=org_123,globex=org_456")`);
	}
	const orgs: Record<string, string> = {};
	for (const pair of (raw as string).split(",")) {
		const [slug, orgId] = pair.split("=").map((s) => s.trim());
		if (!(slug && orgId)) {
			fail(`BACKFILL_ORGS entry "${pair}" is not slug=org_id`);
		}
		orgs[slug as string] = orgId as string;
	}
	return orgs;
};

const monthsNewestFirst = (from: string, to: string): string[] => {
	const months: string[] = [];
	let [year, month] = from.split("-").map(Number) as [number, number];
	const [toYear, toMonth] = to.split("-").map(Number) as [number, number];
	while (year < toYear || (year === toYear && month <= toMonth)) {
		months.push(`${year}-${String(month).padStart(2, "0")}`);
		month += 1;
		if (month > 12) {
			month = 1;
			year += 1;
		}
	}
	return months.reverse();
};

const hms = (): string => new Date().toTimeString().slice(0, 8);

const formatDuration = (seconds: number): string => {
	if (seconds < 90) {
		return `${Math.round(seconds)}s`;
	}
	const minutes = Math.floor(seconds / 60);
	if (minutes < 90) {
		return `${minutes}m${Math.round(seconds % 60)}s`;
	}
	return `${Math.floor(minutes / 60)}h${minutes % 60}m`;
};

// The lock lives on this held session; it auto-releases when the process exits.
const acquireRunLock = async (neonUrl: string): Promise<Client> => {
	const client = new Client({ connectionString: neonUrl });
	await client.connect();
	const { rows } = await client.query<{ locked: boolean }>(
		"SELECT pg_try_advisory_lock($1) AS locked",
		[ADVISORY_LOCK_KEY],
	);
	if (!rows[0].locked) {
		await client.end();
		fail(
			"Another backfill run holds the advisory lock — refusing to start a second.",
		);
	}
	return client;
};

const ensureStagingTable = async (neonUrl: string): Promise<void> => {
	const result =
		await $`psql ${withSystemRootCert(neonUrl)} -X -v ON_ERROR_STOP=1 -c ${STAGING_DDL}`
			.quiet()
			.nothrow();
	if (result.exitCode !== 0) {
		throw new Error(
			`events_staging setup failed: ${result.stderr.toString().trim()}`,
		);
	}
};

// Returns rows staged; empty=true when the parquet glob matched no files (not an error).
// duckdb and psql run as separate commands (no pipe: Bun's Linux pipeline breaks duckdb's
// /dev/stdout, and separate exit codes make failure detection exact).
const stageChunk = async (
	neonUrl: string,
	s3Prefix: string,
	orgId: string,
	month: string,
): Promise<{ empty: boolean; staged: number }> => {
	const [year, monthNumber] = month.split("-") as [string, string];
	const scriptPath = "/tmp/backfill_export.sql";
	const csvPath = "/tmp/backfill_chunk.csv";
	await Bun.write(
		scriptPath,
		duckDbExportSql(s3Prefix, orgId, year, monthNumber, csvPath),
	);
	const duck = await $`duckdb < ${Bun.file(scriptPath)}`.quiet().nothrow();
	const duckErr = duck.stderr.toString();
	if (duck.exitCode !== 0) {
		if (/no files found/i.test(duckErr)) {
			return { empty: true, staged: 0 };
		}
		throw new Error(`duckdb export failed (${month}): ${duckErr.trim()}`);
	}
	// Truncate first so rows left by a previously crashed run aren't double-staged.
	const result =
		await $`psql ${withSystemRootCert(neonUrl)} -X -v ON_ERROR_STOP=1 -c ${"TRUNCATE events_staging"} -c ${SET_UTC} -c ${copyToStaging(csvPath)}`
			.quiet()
			.nothrow();
	await $`rm -f ${csvPath}`.quiet().nothrow();
	if (result.exitCode !== 0) {
		throw new Error(
			`staging failed (${month}): ${result.stderr.toString().trim()}`,
		);
	}
	const staged = Number(result.stdout.toString().match(/COPY (\d+)/)?.[1] ?? 0);
	// Files existed but zero rows staged — anomalous; refuse to mark the chunk done.
	// Operator can append the key to .backfill_neon_done if truly empty.
	if (staged === 0) {
		throw new Error(
			`0 rows staged for ${month} despite parquet files existing — investigate before marking done`,
		);
	}
	return { empty: false, staged };
};

const mergeChunk = async (neonUrl: string): Promise<number> => {
	const result =
		await $`psql ${withSystemRootCert(neonUrl)} -X -v ON_ERROR_STOP=1 -c ${SET_UTC} -c ${MERGE_SQL} -c ${"TRUNCATE events_staging"}`
			.quiet()
			.nothrow();
	if (result.exitCode !== 0) {
		throw new Error(`merge failed: ${result.stderr.toString().trim()}`);
	}
	return Number(result.stdout.toString().match(/INSERT \d+ (\d+)/)?.[1] ?? 0);
};

const loadDoneChunks = async (): Promise<Set<string>> => {
	const file = Bun.file(DONE_FILE);
	if (!(await file.exists())) {
		return new Set();
	}
	const lines = (await file.text())
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
	return new Set(lines);
};

const markChunkDone = (key: string): Promise<void> =>
	appendFile(DONE_FILE, `${key}\n`);

const main = async (): Promise<void> => {
	const args = parseArgs(process.argv.slice(2));
	const neonUrl = process.env.NEON_DIRECT_URL;
	if (!neonUrl) {
		fail("NEON_DIRECT_URL env var is required (Neon direct, non-pooled URL)");
		return;
	}
	const orgs = loadOrgs();
	const bucket = process.env.EVENTS_S3_BUCKET;
	if (!bucket) {
		fail("EVENTS_S3_BUCKET env var is required (events landing bucket name)");
		return;
	}
	const s3Prefix = `s3://${bucket}/events`;
	if (args.org !== "all" && !(args.org in orgs)) {
		fail(`--org must be one of: ${Object.keys(orgs).join(", ")}, all`);
	}
	const orgSlugs = args.org === "all" ? Object.keys(orgs) : [args.org];

	const lockClient = await acquireRunLock(neonUrl);
	await ensureStagingTable(neonUrl);
	const doneChunks = await loadDoneChunks();
	const months = monthsNewestFirst(args.from, args.to);
	const chunks = orgSlugs.flatMap((slug) =>
		months.map((month) => ({ month, slug })),
	);

	let remaining = chunks.filter(
		({ slug, month }) => !doneChunks.has(`${slug}:${month}`),
	).length;
	console.log(
		`[${hms()}] ${chunks.length} chunks (${remaining} pending) orgs=${orgSlugs.join(",")} range=${args.from}..${args.to} newest-first`,
	);

	const insertedPerOrg: Record<string, number> = {};
	let totalInserted = 0;
	const chunkSeconds: number[] = [];

	for (const { slug, month } of chunks) {
		const key = `${slug}:${month}`;
		if (doneChunks.has(key)) {
			console.log(
				`[${hms()}] org=${slug} month=${month} already done, skipping`,
			);
			continue;
		}

		const startedAt = Date.now();
		const { empty, staged } = await stageChunk(
			neonUrl,
			s3Prefix,
			orgs[slug] as string,
			month,
		);
		const inserted = staged > 0 ? await mergeChunk(neonUrl) : 0;
		const elapsedSeconds = (Date.now() - startedAt) / 1000;

		chunkSeconds.push(elapsedSeconds);
		remaining -= 1;
		totalInserted += inserted;
		insertedPerOrg[slug] = (insertedPerOrg[slug] ?? 0) + inserted;
		const meanSeconds =
			chunkSeconds.reduce((sum, s) => sum + s, 0) / chunkSeconds.length;
		const note = empty ? " (no parquet files)" : "";
		console.log(
			`[${hms()}] org=${slug} month=${month} staged=${staged} inserted=${inserted} skipped_dups=${staged - inserted} elapsed=${elapsedSeconds.toFixed(1)}s total_inserted=${totalInserted} eta=${formatDuration(meanSeconds * remaining)}${note}`,
		);
		await markChunkDone(key);
	}

	console.log("\nBackfill complete. Inserted per org:");
	for (const slug of orgSlugs) {
		console.log(`  ${slug} (${orgs[slug]}): ${insertedPerOrg[slug] ?? 0}`);
	}
	console.log(
		"\nVerify in Neon:\n  SELECT org_id, count(*) FROM events GROUP BY 1;",
	);
	await lockClient.end();
};

await main();
