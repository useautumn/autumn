/**
 * The coordinator composes with the real client/worker/state store: a cold
 * baseline of 72 accepts track 5 and reads 67 without a second source load.
 */
import { expect, test } from "bun:test";
import type { MeteringRecord } from "@autumn/kafka";
import { createReplayHydrationCoordinator } from "@/internal/balances/replay/createReplayHydrationCoordinator.js";
import { openStateStore } from "../../../../../apps/balance-worker/src/state/openStateStore.js";
import {
	createWorkerFixture,
	partition,
	topic,
} from "../balanceWorker/worker-fixture.js";
import {
	createLoadedSource,
	createReplayHydrationFixture,
} from "./replay-hydration-fixture.js";

test.concurrent(
	"cold track hydrates baseline 72 then check returns 67 with no hot source read",
	async () => {
		const fixture = createReplayHydrationFixture();
		const records: MeteringRecord[] = [];
		const store = openStateStore({ databasePath: ":memory:" });
		store.initializePartition({ topic, partition, nextOffset: 0n });
		const worker = createWorkerFixture({
			stateStore: store,
			records,
			now: fixture.selection.baseline.capturedAtMs,
		});
		let sourceCalls = 0;
		const coordinator = createReplayHydrationCoordinator({
			source: createLoadedSource({
				state: fixture.state,
				catalogRows: fixture.catalogRows,
				onLoad: async () => {
					sourceCalls++;
					return {
						kind: "loaded",
						state: fixture.state,
						catalogRows: fixture.catalogRows,
					};
				},
			}),
			client: worker.client,
		});
		try {
			expect(
				await coordinator.track({
					selection: fixture.selection,
					command: fixture.trackCommand,
				}),
			).toMatchObject({
				kind: "new",
				mutation: { result: { status: "applied", balanceAfter: 67 } },
			});
			expect(
				await coordinator.check({
					selection: fixture.selection,
					command: fixture.checkCommand,
				}),
			).toMatchObject({ kind: "decided", balance: 67 });
			expect(sourceCalls).toBe(1);
			expect(records.map((record) => record.command.type)).toEqual([
				"initialize",
				"track",
			]);
		} finally {
			await coordinator.close();
			await worker.close();
			store.close();
		}
	},
);

test.concurrent(
	"two coordinators racing one worker emit one seed and duplicate track does not charge twice",
	async () => {
		const fixture = createReplayHydrationFixture();
		const records: MeteringRecord[] = [];
		const store = openStateStore({ databasePath: ":memory:" });
		store.initializePartition({ topic, partition, nextOffset: 0n });
		const worker = createWorkerFixture({
			stateStore: store,
			records,
			now: fixture.selection.baseline.capturedAtMs,
		});
		const source = createLoadedSource({
			state: fixture.state,
			catalogRows: fixture.catalogRows,
		});
		const first = createReplayHydrationCoordinator({
			source,
			client: worker.client,
		});
		const second = createReplayHydrationCoordinator({
			source,
			client: worker.client,
		});
		try {
			const results = await Promise.all([
				first.track({
					selection: fixture.selection,
					command: fixture.trackCommand,
				}),
				second.track({
					selection: fixture.selection,
					command: fixture.trackCommand,
				}),
			]);
			expect(results.map((result) => result.kind).sort()).toEqual([
				"duplicate",
				"new",
			]);
			if (!("mutation" in results[0]) || !("mutation" in results[1]))
				throw new Error("Expected both track commands to reach the worker");
			expect(results[0].mutation).toEqual(results[1].mutation);
			expect(results[0]).toMatchObject({
				mutation: { result: { status: "applied", balanceAfter: 67 } },
			});
			expect(
				records.filter((record) => record.command.type === "initialize"),
			).toHaveLength(1);
			expect(
				records.filter((record) => record.command.type === "track"),
			).toHaveLength(1);
			expect(
				store.readState({ identity: fixture.selection.identity }),
			).toMatchObject({
				revision: 2,
				customerEntitlements: expect.arrayContaining([
					expect.objectContaining({ id: "messages_grant", balance: 67 }),
				]),
			});
		} finally {
			await Promise.all([first.close(), second.close()]);
			await worker.close();
			store.close();
		}
	},
);
