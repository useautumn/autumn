import { Database } from "bun:sqlite";
import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { deepFreeze } from "../state/deepFreeze.js";

const SAMPLE_ROWS = 200;
const BUDGET_MS = 250;

type SampleRow = {
	customerId: string;
	entityId: string;
	stateJson: string;
	catalogJson: string;
	orgJson: string;
};

const slotFilesUnder = ({ dataDir }: { dataDir: string }): string[] =>
	readdirSync(dataDir, { recursive: true, encoding: "utf8" })
		.filter((name) => /slot-\d+-of-\d+\.sqlite$/.test(name))
		.map((name) => join(dataDir, name));

/** Mean µs per call, repeating over the sample until the time budget is spent. */
const timePerCall = <T>(items: T[], fn: (item: T) => unknown): number => {
	let calls = 0;
	const startedAt = performance.now();
	while (performance.now() - startedAt < BUDGET_MS)
		for (const item of items) {
			fn(item);
			calls += 1;
		}
	return (
		Math.round(((performance.now() - startedAt) * 1000 * 100) / calls) / 100
	);
};

/** Upserts sampled rows into a scratch file beside the slots: the same volume and settings, never a real slot. */
const timeScratchUpserts = ({
	dataDir,
	rows,
}: {
	dataDir: string;
	rows: SampleRow[];
}): number => {
	const path = join(dataDir, "diagnostics-scratch.sqlite");
	const database = new Database(path, { create: true });
	try {
		database.run("PRAGMA journal_mode = WAL");
		database.run("PRAGMA synchronous = NORMAL");
		database.run(
			"CREATE TABLE IF NOT EXISTS t (k TEXT PRIMARY KEY, a TEXT, b TEXT, c TEXT) WITHOUT ROWID",
		);
		const upsert = database.query(
			"INSERT INTO t (k, a, b, c) VALUES (?, ?, ?, ?) ON CONFLICT (k) DO UPDATE SET a = excluded.a, b = excluded.b, c = excluded.c",
		);
		return timePerCall(rows, (row) =>
			upsert.run(
				`${row.customerId}:${row.entityId}`,
				row.stateJson,
				row.catalogJson,
				row.orgJson,
			),
		);
	} finally {
		database.close();
		for (const suffix of ["", "-wal", "-shm"])
			rmSync(`${path}${suffix}`, { force: true });
	}
};

const median = (values: number[]): number =>
	[...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;

/** The per-check primitives timed on this machine against stored rows: only timings and sizes leave. */
export const benchPrimitives = ({ dataDir }: { dataDir: string }) => {
	const files = slotFilesUnder({ dataDir });
	const databases = files.map((path) => {
		const database = new Database(path, { readonly: true });
		database.run("PRAGMA mmap_size = 268435456");
		return database;
	});
	try {
		const sampled = databases.flatMap((database) =>
			database
				.query<SampleRow, []>(
					`SELECT customer_id AS customerId, entity_id AS entityId, state_json AS stateJson,
						catalog_json AS catalogJson, org_json AS orgJson
						FROM subject_states JOIN subject_slices USING (customer_id, entity_id) LIMIT 2`,
				)
				.all()
				.map((row) => ({ row, database })),
		);
		const sample = sampled.slice(0, SAMPLE_ROWS);
		if (sample.length === 0) return { files: files.length, rows: 0 };

		const versionReads = sample.map(({ row, database }) => ({
			row,
			query: database.query(
				"SELECT log_offset, read_at FROM subject_states WHERE customer_id = ? AND entity_id = ?",
			),
		}));
		const rowReads = sample.map(({ row, database }) => ({
			row,
			query: database.query(
				`SELECT log_offset, read_at, state_json, catalog_json, org_json
					FROM subject_states JOIN subject_slices USING (customer_id, entity_id)
					WHERE customer_id = ? AND entity_id = ?`,
			),
		}));
		const rows = sample.map(({ row }) => row);
		let sink = 0;
		return {
			arch: process.arch,
			files: files.length,
			rows: rows.length,
			medianBytes: {
				state: median(rows.map((row) => row.stateJson.length)),
				catalog: median(rows.map((row) => row.catalogJson.length)),
				org: median(rows.map((row) => row.orgJson.length)),
			},
			microsPerCall: {
				jsLoop1k: timePerCall(rows, () => {
					for (let i = 0; i < 1000; i++) sink = (sink + i * 7) % 1000003;
				}),
				sqliteVersionRead: timePerCall(versionReads, ({ row, query }) =>
					query.get(row.customerId, row.entityId),
				),
				sqliteRowRead: timePerCall(rowReads, ({ row, query }) =>
					query.get(row.customerId, row.entityId),
				),
				parseState: timePerCall(rows, (row) => JSON.parse(row.stateJson)),
				parseStateAndFreeze: timePerCall(rows, (row) =>
					deepFreeze(JSON.parse(row.stateJson)),
				),
				parseCatalog: timePerCall(rows, (row) => JSON.parse(row.catalogJson)),
				stringifyCatalog: timePerCall(
					rows.map((row) => JSON.parse(row.catalogJson)),
					(catalog) => JSON.stringify(catalog),
				),
				sqliteUpsertScratch: timeScratchUpserts({ dataDir, rows }),
				stringifyState: timePerCall(
					rows.map((row) => JSON.parse(row.stateJson)),
					(state) => JSON.stringify(state),
				),
			},
			sink,
		};
	} finally {
		for (const database of databases) database.close();
	}
};
