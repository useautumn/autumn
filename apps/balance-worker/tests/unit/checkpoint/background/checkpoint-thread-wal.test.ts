import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import {
	createThreadFixture,
	identity,
	topic,
	waitForGate,
} from "./thread-fixtures.js";

test.concurrent(
	"repeated termination inside a read transaction releases the WAL and leaves serving writes usable",
	async () => {
		const fixture = createThreadFixture({ pauseAt: "after_read" });
		const database = new Database(fixture.databasePath, {
			strict: true,
			safeIntegers: true,
		});
		const checkpoint = database.query<
			{ busy: bigint; log: bigint; checkpointed: bigint },
			[]
		>("PRAGMA wal_checkpoint(TRUNCATE)");
		try {
			checkpoint.get();
			for (let attempt = 1; attempt <= 3; attempt++) {
				Atomics.store(fixture.gate, 0, 0);
				const controller = new AbortController();
				const exporting = fixture.exporter.export({
					topic,
					partition: 0,
					signal: controller.signal,
				});
				const result = exporting.catch((cause: unknown) => cause);
				await waitForGate(fixture.gate);
				fixture.applyTrack({ offset: BigInt(attempt) });
				const pinned = database
					.query<{ log: bigint; checkpointed: bigint }, []>(
						"PRAGMA wal_checkpoint(PASSIVE)",
					)
					.get();
				expect(pinned?.log).toBeGreaterThan(pinned?.checkpointed ?? 0n);
				controller.abort(new Error("assignment revoked"));
				expect(await result).toMatchObject({ message: "assignment revoked" });
				expect(checkpoint.get()).toEqual({
					busy: 0n,
					log: 0n,
					checkpointed: 0n,
				});
				expect(fixture.store.readState({ identity })?.revision).toBe(attempt);
			}
			expect(fixture.starts()).toBe(3);
		} finally {
			database.close();
			await fixture.close();
		}
	},
	20_000,
);
