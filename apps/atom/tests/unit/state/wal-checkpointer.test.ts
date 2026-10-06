import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	startWalCheckpointer,
	TICKS_PER_FILE,
} from "../../../src/state/startWalCheckpointer.js";

const openWriter = ({ path }: { path: string }) => {
	const database = new Database(path, { create: true });
	database.run("PRAGMA journal_mode = WAL");
	database.run("PRAGMA wal_autocheckpoint = 0");
	database.run("CREATE TABLE t (k INTEGER PRIMARY KEY, v TEXT NOT NULL)");
	for (let k = 0; k < 50; k++)
		database.run("INSERT INTO t (k, v) VALUES (?, ?)", [k, "x".repeat(4000)]);
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
});
