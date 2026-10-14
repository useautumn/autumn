import { Database } from "bun:sqlite";
import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getSqliteOpenLock } from "../../../src/state/newSqliteConnection.js";
import { openSlotDatabase } from "../../../src/state/openSlotDatabase.js";
import { OPENER_PATH } from "./utils/openSlotInWorker.js";

const root = mkdtempSync(join(tmpdir(), "atom-fresh-open-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const THREADS = 4;
const ROUNDS = 40;
const ROW =
	"INSERT INTO subject_states (customer_id, entity_id, log_offset, read_at, applied_at, state_json, slice_hash) VALUES ('cus_1', '', 1, 1, 1, '{}', 'h')";

const openOnWorkers = async ({
	path,
	threads,
}: {
	path: string;
	threads: number;
}) => {
	const start = new SharedArrayBuffer(4);
	const workers = Array.from(
		{ length: threads },
		() =>
			new Worker(OPENER_PATH, {
				workerData: { path, start, threads, lock: getSqliteOpenLock() },
			} as never),
	);
	const outcomes = await Promise.all(
		workers.map(
			(worker) =>
				new Promise<string>((resolve) =>
					worker.addEventListener("message", (event) => resolve(event.data)),
				),
		),
	);
	for (const worker of workers) worker.terminate();
	return outcomes;
};

const countRows = ({ path }: { path: string }) => {
	const database = new Database(path, { readonly: true, safeIntegers: true });
	const count = database
		.query<{ n: bigint }, []>("SELECT count(*) AS n FROM subject_states")
		.get()?.n;
	database.close();
	return count;
};

test("threads opening one new file together all open it, with its tables in place", async () => {
	const failures: string[] = [];
	for (let round = 0; round < ROUNDS; round++) {
		const path = join(root, `slot-${round}.sqlite`);
		const outcomes = await openOnWorkers({ path, threads: THREADS });
		failures.push(...outcomes.filter((outcome) => outcome !== "ok"));
		expect(countRows({ path })).toBe(0n);
	}
	expect(failures).toEqual([]);
}, 60_000);

test("a thread opening a file while another is creating it keeps what the other wrote", async () => {
	const path = join(root, "racing.sqlite");
	const templatePath = join(root, "template.sqlite");
	openSlotDatabase({ databasePath: templatePath }).close();
	const other = new Database(path, { create: true, safeIntegers: true });
	other.run("PRAGMA journal_mode = WAL");
	other.run("BEGIN EXCLUSIVE");
	const template = new Database(templatePath, { readonly: true });
	for (const { sql } of template
		.query<{ sql: string }, []>(
			"SELECT sql FROM sqlite_master WHERE sql IS NOT NULL",
		)
		.all())
		other.run(sql);
	template.close();
	other.run(ROW);
	other.run("PRAGMA user_version = 7");

	const opened = openOnWorkers({ path, threads: 1 });
	await Bun.sleep(300);
	other.run("COMMIT");
	other.close();

	expect(await opened).toEqual(["ok"]);
	expect(countRows({ path })).toBe(1n);
});

test("a file already at this version is opened without emptying it", () => {
	const path = join(root, "kept.sqlite");
	const first = openSlotDatabase({ databasePath: path });
	first.run(ROW);
	first.close();

	openSlotDatabase({ databasePath: path }).close();

	expect(countRows({ path })).toBe(1n);
});
