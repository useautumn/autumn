import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openCheckpointReadDatabase } from "../../../../src/state/checkpoint/openCheckpointReadDatabase.js";
import { openBalanceStateDatabase } from "../../../../src/state/sqliteBalanceStateSchema.js";

describe("checkpoint read-only connection", () => {
	test.concurrent(
		"reads a WAL database without being able to change state or migrate it",
		() => {
			const directory = mkdtempSync(
				join(tmpdir(), "autumn-checkpoint-reader-"),
			);
			const databasePath = join(directory, "balances.sqlite");
			const writer = openBalanceStateDatabase({ databasePath });
			const reader = openCheckpointReadDatabase({ databasePath });
			try {
				expect(reader.query("PRAGMA journal_mode").get()).toEqual({
					journal_mode: "wal",
				});
				expect(() =>
					reader.run("INSERT INTO partition_progress VALUES ('topic', 0, 0)"),
				).toThrow();
				expect(() => reader.run("PRAGMA user_version = 2")).toThrow();
				writer.run("INSERT INTO partition_progress VALUES ('topic', 0, 42)");
				expect(
					reader.query("SELECT next_offset FROM partition_progress").get(),
				).toEqual({ next_offset: 42n });
			} finally {
				reader.close();
				writer.close();
				rmSync(directory, { recursive: true, force: true });
			}
		},
	);

	test.concurrent(
		"refuses memory, missing files, incompatible schemas and non-WAL databases",
		async () => {
			const directory = mkdtempSync(
				join(tmpdir(), "autumn-checkpoint-reader-refusal-"),
			);
			const databasePath = join(directory, "balances.sqlite");
			try {
				expect(() =>
					openCheckpointReadDatabase({ databasePath: ":memory:" }),
				).toThrow("file-backed");
				expect(() => openCheckpointReadDatabase({ databasePath })).toThrow();
				expect(await Bun.file(databasePath).exists()).toBe(false);
				const writer = openBalanceStateDatabase({ databasePath });
				writer.run("PRAGMA user_version = 2");
				expect(() => openCheckpointReadDatabase({ databasePath })).toThrow(
					"schema 1",
				);
				expect(writer.query("PRAGMA user_version").get()).toEqual({
					user_version: 2n,
				});
				writer.run("PRAGMA user_version = 1");
				writer.close();
				const notWal = new Database(databasePath);
				notWal.run("PRAGMA journal_mode = DELETE");
				notWal.close();
				expect(() => openCheckpointReadDatabase({ databasePath })).toThrow(
					"WAL",
				);
			} finally {
				rmSync(directory, { recursive: true, force: true });
			}
		},
	);
});
