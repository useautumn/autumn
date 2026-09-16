/**
 * The coordinator composes with the real client/worker/state store: a cold
 * baseline of 72 accepts track 5 and reads 67 without a second source load.
 */
import { expect, test } from "bun:test";
import type { MeteringRecord } from "@autumn/kafka";
import { createBalanceHydrationCoordinator } from "@/internal/balances/hydration/createBalanceHydrationCoordinator.js";
import { openSqliteBalanceStateStore } from "../../../../../apps/balance-worker/src/state/sqliteBalanceStateStore.js";
import {
	createWorkerFixture,
	partition,
	topic,
} from "../balanceWorker/worker-fixture.js";
import {
	createBalanceHydrationFixture,
	createLoadedSource,
} from "./balance-hydration-fixture.js";

test.concurrent(
	"cold track hydrates baseline 72 then check returns 67 with no hot source read",
	async () => {
		const fixture = createBalanceHydrationFixture();
		const records: MeteringRecord[] = [];
		const store = openSqliteBalanceStateStore({ databasePath: ":memory:" });
		store.initializePartition({ topic, partition, nextOffset: 0n });
		const worker = createWorkerFixture({
			stateStore: store,
			records,
			now: fixture.selection.baseline.capturedAtMs,
		});
		let sourceCalls = 0;
		const coordinator = createBalanceHydrationCoordinator({
			source: createLoadedSource({
				state: fixture.state,
				onLoad: async () => {
					sourceCalls++;
					return { kind: "loaded", state: fixture.state };
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
				outcome: { status: "applied", balanceAfter: 67 },
			});
			expect(
				await coordinator.check({
					selection: fixture.selection,
					command: fixture.checkCommand,
				}),
			).toMatchObject({ kind: "decided", balance: 67 });
			expect(sourceCalls).toBe(1);
			expect(records.map((record) => record.type)).toEqual([
				"state_initialized",
				"track_outcome",
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
		const fixture = createBalanceHydrationFixture();
		const records: MeteringRecord[] = [];
		const store = openSqliteBalanceStateStore({ databasePath: ":memory:" });
		store.initializePartition({ topic, partition, nextOffset: 0n });
		const worker = createWorkerFixture({
			stateStore: store,
			records,
			now: fixture.selection.baseline.capturedAtMs,
		});
		const source = createLoadedSource({ state: fixture.state });
		const first = createBalanceHydrationCoordinator({
			source,
			client: worker.client,
		});
		const second = createBalanceHydrationCoordinator({
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
			if (!("outcome" in results[0]) || !("outcome" in results[1]))
				throw new Error("Expected both track commands to reach the worker");
			expect(results[0].outcome).toEqual(results[1].outcome);
			expect(results[0]).toMatchObject({
				outcome: { status: "applied", balanceAfter: 67 },
			});
			expect(
				records.filter((record) => record.type === "state_initialized"),
			).toHaveLength(1);
			expect(
				records.filter((record) => record.type === "track_outcome"),
			).toHaveLength(1);
			expect(
				store.readState({ identity: fixture.selection.identity }),
			).toMatchObject({
				revision: 1,
				featureStatesById: {
					messages: {
						customerEntitlements: [{ balance: 67, usage: 43 }],
					},
				},
			});
		} finally {
			await Promise.all([first.close(), second.close()]);
			await worker.close();
			store.close();
		}
	},
);
