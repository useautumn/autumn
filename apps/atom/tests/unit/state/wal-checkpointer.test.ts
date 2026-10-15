import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	startWalCheckpointer,
	TICKS_PER_FILE,
} from "../../../src/state/startWalCheckpointer.js";

/** Well past the size at which a log is copied ahead of its turn (CHECKPOINT_WAL_BYTES). */
const BUSY_WAL_BYTES = 24 * 1024 * 1024;

const openWriter = ({ path, rows = 50 }: { path: string; rows?: number }) => {
	const database = new Database(path, { create: true });
	database.run("PRAGMA journal_mode = WAL");
	database.run("PRAGMA wal_autocheckpoint = 0");
	database.run("CREATE TABLE t (k INTEGER PRIMARY KEY, v TEXT NOT NULL)");
	const insert = database.prepare("INSERT INTO t (k, v) VALUES (?, ?)");
	for (let k = 0; k < rows; k++) insert.run(k, "x".repeat(4000));
	return database;
};

describe("WAL checkpointer", () => {
	test("within one round of ticks, copies every log in the data folder, an org's folder included, back into its file", () => {
		const dataDir = mkdtempSync(join(tmpdir(), "atom-wal-"));
		mkdirSync(join(dataDir, "atoms", "org_1"), { recursive: true });
		const paths = [
			join(dataDir, "slot-000-of-001.sqlite"),
			join(dataDir, "atoms", "org_1", "slot-000-of-001.sqlite"),
		];
		const writers = paths.map((path) => openWriter({ path }));
		const fileBytes = () => paths.map((path) => statSync(path).size);
		const before = fileBytes();

		const checkpointer = startWalCheckpointer({
			dataDir,
			logger: { warn: () => {} },
		});
		for (let tick = 0; tick < TICKS_PER_FILE; tick++) checkpointer.checkpoint();
		checkpointer.stop();

		fileBytes().forEach((bytes, index) => {
			expect(bytes).toBeGreaterThan((before[index] ?? 0) + 150_000);
		});
		for (const writer of writers) {
			expect(writer.query("SELECT count(*) AS n FROM t").get()).toEqual({
				n: 50,
			});
			writer.close();
		}
	});

	test("copies a written log back into its file within 10 ticks, however many files the folder holds", () => {
		const dataDir = mkdtempSync(join(tmpdir(), "atom-wal-"));
		const paths = Array.from({ length: 12 }, (_, slot) =>
			join(dataDir, `slot-${String(slot).padStart(3, "0")}-of-012.sqlite`),
		);
		const writers = paths.map((path) => openWriter({ path }));
		const before = paths.map((path) => statSync(path).size);

		const checkpointer = startWalCheckpointer({
			dataDir,
			logger: { warn: () => {} },
		});
		for (let tick = 0; tick < 10; tick++) checkpointer.checkpoint();
		checkpointer.stop();

		paths.forEach((path, index) => {
			expect(statSync(path).size).toBeGreaterThan(
				(before[index] ?? 0) + 150_000,
			);
		});
		for (const writer of writers) writer.close();
	});

	test("a log grown past the pacing size is copied on the next tick, ahead of its turn in the cadence", () => {
		const dataDir = mkdtempSync(join(tmpdir(), "atom-wal-"));
		const quiet = join(dataDir, "slot-000-of-002.sqlite");
		const busy = join(dataDir, "slot-001-of-002.sqlite");
		const writers = [
			openWriter({ path: quiet }),
			openWriter({ path: busy, rows: BUSY_WAL_BYTES / 4000 }),
		];
		expect(statSync(`${busy}-wal`).size).toBeGreaterThan(BUSY_WAL_BYTES);
		const before = statSync(busy).size;

		const checkpointer = startWalCheckpointer({
			dataDir,
			logger: { warn: () => {} },
		});
		// Tick 0 is the quiet file's turn; the busy file's turn would be tick 1.
		checkpointer.checkpoint();
		checkpointer.stop();

		expect(statSync(busy).size).toBeGreaterThan(before + BUSY_WAL_BYTES);
		for (const writer of writers) writer.close();
	});
});
