import { expect, test } from "bun:test";
import {
	createCustomerMeteringState,
	parseCheckCommand,
	parseTrackCommand,
} from "@autumn/balance-engine";
import type { MeteringRecord } from "@autumn/kafka";
import { createBalanceWorkerApp } from "../../../src/http/createBalanceWorkerApp.js";
import type { BalanceWorkerRequestContext } from "../../../src/http/types/balanceWorkerHttp.js";
import { createPartitionProcessor } from "../../../src/processor/createPartitionProcessor.js";
import { OwnedPartitionNotReadyError } from "../../../src/runtime/runtimeErrors.js";
import { openSqliteBalanceStateStore } from "../../../src/state/sqliteBalanceStateStore.js";

const identity = {
	orgId: "org",
	env: "sandbox",
	customerId: "external_customer",
};
const state = createCustomerMeteringState({
	identity,
	featureStatesById: {
		messages: {
			kind: "direct_metered_v1",
			customerEntitlements: [
				{
					id: "grant",
					balance: 10,
					usage: 0,
					granted: 10,
					externalId: null,
					planId: "pro",
					reset: null,
					expiresAt: null,
				},
			],
		},
	},
});
const initialization = {
	schemaVersion: 1,
	type: "initialize",
	requestId: "initialize",
	initializationId: "baseline",
	identity,
	state,
	occurredAt: 1_700_000_000_000,
};
const checkCommand = parseCheckCommand({
	input: {
		schemaVersion: 1,
		type: "check",
		requestId: "check",
		identity,
		entityId: null,
		featureId: "messages",
		requiredBalance: 5,
		properties: null,
		occurredAt: 1_700_000_000_000,
	},
});
const trackCommand = parseTrackCommand({
	input: {
		schemaVersion: 1,
		type: "track",
		requestId: "track",
		commandId: "track",
		identity,
		entityId: null,
		featureId: "messages",
		value: 5,
		overageBehavior: "reject",
		properties: null,
		occurredAt: 1_700_000_000_000,
	},
});

function createFixture({
	commitGate,
	ready = true,
}: {
	commitGate?: Promise<void>;
	ready?: boolean;
} = {}) {
	const store = openSqliteBalanceStateStore({ databasePath: ":memory:" });
	store.initializePartition({
		topic: "outcomes",
		partition: 0,
		nextOffset: 0n,
	});
	const batches: MeteringRecord[][] = [];
	const appending = Promise.withResolvers<void>();
	let offset = 0n;
	const processor = createPartitionProcessor({
		ctx: {
			stateStore: store,
			appender: {
				appendCommitted: async ({ outcomes }) => {
					batches.push([...outcomes]);
					appending.resolve();
					await commitGate;
					const baseOffset = offset;
					offset += BigInt(outcomes.length);
					return { baseOffset };
				},
			},
			trackReceiptPolicy: {
				retentionMs: 86_400_000,
				now: () => 1_700_000_000_000,
			},
			assertCanRead: () => undefined,
		},
		config: {
			topic: "outcomes",
			partition: 0,
			writerLimits: {
				maxBatchSize: 100,
				maxPendingCommands: 100,
				maxPendingCommandsPerCustomer: 100,
			},
		},
	});
	const process: BalanceWorkerRequestContext["runtime"]["process"] = (run) => {
		if (!ready)
			throw new OwnedPartitionNotReadyError({ status: "catching_up" });
		return run(processor);
	};
	const app = createBalanceWorkerApp({
		ctx: {
			ownership: {
				findRuntime: ({ routeEpoch }) =>
					routeEpoch === "1" ? { process } : undefined,
			},
			partitionResolver: { partitionForIdentity: () => 0 },
			logger: {
				info: () => undefined,
				warn: () => undefined,
				error: () => undefined,
			},
		},
	});
	const post = async ({
		path,
		command,
		routeEpoch = "1",
	}: {
		path: string;
		command: unknown;
		routeEpoch?: string;
	}) =>
		app.request(`/v1/${path}`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ route: { partition: 0, routeEpoch }, command }),
		});
	const close = async () => {
		await processor.drain();
		store.close();
	};
	return {
		store,
		post,
		batches,
		close,
		processor,
		appending: appending.promise,
	};
}

test.concurrent(
	"initialize, track and check share committed state and durable retry identity",
	async () => {
		const fixture = createFixture();
		try {
			const initialized = await fixture.post({
				path: "initialize",
				command: initialization,
			});
			expect(initialized.status).toBe(200);
			expect(await initialized.json()).toMatchObject({
				decision: { kind: "initialized", state },
			});
			const tracked = await fixture.post({
				path: "track",
				command: trackCommand,
			});
			expect(tracked.status).toBe(200);
			expect(await tracked.json()).toMatchObject({
				decision: { kind: "new", outcome: { balanceAfter: 5 } },
			});
			const checked = await fixture.post({
				path: "check",
				command: checkCommand,
			});
			expect(checked.status).toBe(200);
			expect(await checked.json()).toMatchObject({
				decision: {
					allowed: true,
					revision: 1,
					balanceSnapshot: { granted: 10, balance: 5, usage: 5 },
				},
			});

			const duplicate = await fixture.post({
				path: "initialize",
				command: { ...initialization, requestId: "retry" },
			});
			expect(await duplicate.json()).toMatchObject({
				decision: { kind: "duplicate", state },
			});
			const conflict = await fixture.post({
				path: "initialize",
				command: {
					...initialization,
					state: { ...state, featureStatesById: {} },
				},
			});
			expect(conflict.status).toBe(409);
			expect(await conflict.json()).toMatchObject({
				error: { code: "INITIALIZATION_CONFLICT" },
			});
			const differentBaseline = await fixture.post({
				path: "initialize",
				command: { ...initialization, initializationId: "other_baseline" },
			});
			expect(await differentBaseline.json()).toEqual({
				decision: { kind: "already_initialized" },
			});
			const trackedAgain = await fixture.post({
				path: "track",
				command: trackCommand,
			});
			expect(await trackedAgain.json()).toMatchObject({
				decision: { kind: "duplicate", outcome: { balanceAfter: 5 } },
			});
			expect(fixture.batches.flat().map((record) => record.type)).toEqual([
				"state_initialized",
				"track_outcome",
			]);
			expect(fixture.store.readState({ identity })?.revision).toBe(1);
		} finally {
			await fixture.close();
		}
	},
);

test.concurrent(
	"new request routes reject missing initialization, identity mismatch and stale ownership",
	async () => {
		const fixture = createFixture();
		try {
			for (const [path, command] of [
				["check", checkCommand],
				["track", trackCommand],
			] as const) {
				const response = await fixture.post({ path, command });
				expect(response.status).toBe(409);
				expect(await response.json()).toMatchObject({
					error: { code: "NOT_INITIALIZED" },
				});
			}
			const mismatch = await fixture.post({
				path: "initialize",
				command: {
					...initialization,
					identity: { ...identity, customerId: "other" },
				},
			});
			expect(mismatch.status).toBe(400);
			const nonBaseline = await fixture.post({
				path: "initialize",
				command: { ...initialization, state: { ...state, revision: 1 } },
			});
			expect(nonBaseline.status).toBe(400);
			for (const [path, command] of [
				["initialize", initialization],
				["check", checkCommand],
			] as const) {
				const response = await fixture.post({
					path,
					command,
					routeEpoch: "stale",
				});
				expect(response.status).toBe(400);
				const revoked = await fixture.post({ path, command, routeEpoch: "0" });
				expect(revoked.status).toBe(409);
				expect(await revoked.json()).toMatchObject({
					error: { code: "NOT_OWNER" },
				});
			}
			expect(fixture.batches).toHaveLength(0);
		} finally {
			await fixture.close();
		}
	},
);

test.concurrent(
	"checks and drain wait for an accepted initialization to commit",
	async () => {
		const gate = Promise.withResolvers<void>();
		const fixture = createFixture({ commitGate: gate.promise });
		try {
			const initializePromise = fixture.post({
				path: "initialize",
				command: initialization,
			});
			await fixture.appending;
			expect(fixture.batches).toHaveLength(1);
			let settled = false;
			const checkPromise = fixture
				.post({ path: "check", command: checkCommand })
				.then((response) => {
					settled = true;
					return response;
				});
			let drained = false;
			const draining = fixture.processor.drain().then(() => {
				drained = true;
			});
			await new Promise<void>((resolve) => setImmediate(resolve));
			expect(settled).toBe(false);
			expect(drained).toBe(false);
			expect(fixture.store.readState({ identity })).toBeNull();
			gate.resolve();
			expect((await initializePromise).status).toBe(200);
			expect(await (await checkPromise).json()).toMatchObject({
				decision: { balance: 10, revision: 0 },
			});
			await draining;
		} finally {
			gate.resolve();
			await fixture.close();
		}
	},
);

test.concurrent(
	"initialize and check honor the runtime readiness gate",
	async () => {
		const fixture = createFixture({ ready: false });
		try {
			for (const [path, command] of [
				["initialize", initialization],
				["check", checkCommand],
			] as const) {
				const response = await fixture.post({ path, command });
				expect(response.status).toBe(503);
				expect(await response.json()).toMatchObject({
					error: { code: "NOT_READY" },
				});
			}
			expect(fixture.batches).toHaveLength(0);
		} finally {
			await fixture.close();
		}
	},
);
