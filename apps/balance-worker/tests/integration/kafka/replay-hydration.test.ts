import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	type CheckCommand,
	type CustomerMeteringState,
	createCustomerMeteringState,
	type MeteringIdentity,
	parseCheckCommand,
	parseTrackCommand,
	type TrackCommand,
	type TrackOutcome,
} from "@autumn/balance-engine";
import { createBalanceWorkerClient } from "@autumn/balance-worker-client";
import { createBalanceWorkerEnv } from "@autumn/env/balanceWorker";
import {
	createOwnershipConsumer,
	type OwnershipConsumer,
	type PartitionOwner,
} from "@autumn/kafka";
import { Kafka, logLevel } from "kafkajs";
import type {
	BalanceHydrationCoordinator,
	BalanceHydrationSelection,
	BalanceHydrationSource,
	BalanceHydrationSourceResult,
} from "../../../../../server/src/internal/balances/hydration/balanceHydrationContracts.js";
import { createBalanceHydrationCoordinator } from "../../../../../server/src/internal/balances/hydration/createBalanceHydrationCoordinator.js";
import { createBalanceWorker } from "../../../src/init/createBalanceWorker.js";

const LOOPBACK_BROKER_PATTERN = /^(?:127\.0\.0\.1|localhost):(\d{1,5})$/;

/** Integration coverage runs against a developer's local Kafka only. */
function requireLoopbackBrokers(): string[] {
	const configured = process.env.KAFKA_BROKERS?.trim();
	if (!configured?.length)
		throw new Error("Run test:kafka with an environment broker");
	const brokers: string[] = [];
	for (const entry of configured.split(",")) {
		const broker = entry.trim();
		const port = Number(LOOPBACK_BROKER_PATTERN.exec(broker)?.[1]);
		if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
			throw new Error(
				`Replay hydration tests only connect to a loopback broker with an explicit port: ${broker}`,
			);
		}
		brokers.push(broker);
	}
	return brokers;
}

const loopbackBrokers = requireLoopbackBrokers();
const brokerList = loopbackBrokers.join(",");

const TEST_TIMEOUT_MS = 30_000;
const CLIENT_TIMEOUT_MS = 10_000;
const HYDRATION_DEADLINE_MS = 20_000;
const OWNERSHIP_POLL_ATTEMPTS = 200;
const OWNERSHIP_POLL_INTERVAL_MS = 50;
const LOOPBACK_HOST = "127.0.0.1";
const PARTITION_COUNT = 1;
const METERING_PARTITION = 0;

const BASELINE_ID = "replay-baseline-2024-03-01";
const BASELINE_CAPTURED_AT_MS = 1_709_251_200_000;
const FEATURE_ID = "messages";
const CUSTOMER_ENTITLEMENT_ID = "cus_ent_replay_messages";
const BASELINE_GRANTED = 100;
const BASELINE_BALANCE = 72;
const BASELINE_USAGE = 28;
const TRACKED_VALUE = 5;
const BALANCE_AFTER_TRACK = 67;
const USAGE_AFTER_TRACK = 33;
const REVISION_AFTER_TRACK = 1;
const TRACK_COMMAND_ID = "replay-hydration-track-command";
const TRACK_REQUEST_ID = "replay-hydration-track-request";

const REPLAY_IDENTITY: MeteringIdentity = {
	orgId: "org_replay_hydration",
	env: "live",
	customerId: "cus_replay_hydration_external",
};

const REPLAY_SELECTION: BalanceHydrationSelection = {
	identity: REPLAY_IDENTITY,
	baseline: { id: BASELINE_ID, capturedAtMs: BASELINE_CAPTURED_AT_MS },
	featureIds: [FEATURE_ID],
};

type ReplayTopics = { metering: string; ownership: string };

type WorkerFixture = {
	endpoint: string;
	databasePath: string;
	errors: unknown[];
	stop(): Promise<void>;
};

type ReplayHarness = {
	topics: ReplayTopics;
	deployment: string;
	routing: OwnershipConsumer;
	stop(): Promise<void>;
};

type RecordingReplaySource = {
	source: BalanceHydrationSource;
	readLoadCount(): number;
};

type ReplayScope = {
	harness: ReplayHarness;
	workers: WorkerFixture[];
	coordinators: BalanceHydrationCoordinator[];
	baselineSource: RecordingReplaySource;
	firstOutcome?: TrackOutcome;
};

type PersistedReplayRows = { state: unknown; receipts: unknown };

function ignoreLog(): void {}

function respondEmpty(): Response {
	return new Response();
}

function isRejectedResult(
	result: PromiseSettledResult<void>,
): result is PromiseRejectedResult {
	return result.status === "rejected";
}

function createBaselineState(): CustomerMeteringState {
	return createCustomerMeteringState({
		identity: REPLAY_IDENTITY,
		featureStatesById: {
			[FEATURE_ID]: {
				kind: "direct_metered_v1",
				customerEntitlements: [
					{
						id: CUSTOMER_ENTITLEMENT_ID,
						balance: BASELINE_BALANCE,
						usage: BASELINE_USAGE,
						granted: BASELINE_GRANTED,
						externalId: null,
						planId: null,
						reset: null,
						expiresAt: null,
					},
				],
			},
		},
	});
}

/** Read-only fixture stand-in for the Postgres baseline loader. */
function createRecordingReplaySource(): RecordingReplaySource {
	let loadCount = 0;
	function load(): Promise<BalanceHydrationSourceResult> {
		loadCount += 1;
		return Promise.resolve({ kind: "loaded", state: createBaselineState() });
	}
	function readLoadCount(): number {
		return loadCount;
	}
	return { source: { load }, readLoadCount };
}

/** The restarted worker must answer from its own Kafka log, never from a source. */
function createForbiddenReplaySource(): BalanceHydrationSource {
	function load(): Promise<BalanceHydrationSourceResult> {
		throw new Error("Recovered replay traffic must not reload a baseline");
	}
	return { load };
}

function createReplayTrackCommand(): TrackCommand {
	return parseTrackCommand({
		input: {
			schemaVersion: 1,
			type: "track",
			commandId: TRACK_COMMAND_ID,
			requestId: TRACK_REQUEST_ID,
			identity: REPLAY_IDENTITY,
			entityId: null,
			featureId: FEATURE_ID,
			value: TRACKED_VALUE,
			overageBehavior: "reject",
			properties: null,
			occurredAt: BASELINE_CAPTURED_AT_MS,
		},
	});
}

function createReplayCheckCommand({
	requestId,
}: {
	requestId: string;
}): CheckCommand {
	return parseCheckCommand({
		input: {
			schemaVersion: 1,
			type: "check",
			requestId,
			identity: REPLAY_IDENTITY,
			entityId: null,
			featureId: FEATURE_ID,
			requiredBalance: 1,
			properties: null,
			occurredAt: BASELINE_CAPTURED_AT_MS,
		},
	});
}

/** Bun types the served port as optional even after a successful listen. */
function requireReservedPort({ port }: { port: number | undefined }): number {
	if (port === undefined)
		throw new Error("Bun did not expose a reserved loopback port");
	return port;
}

async function reserveLoopbackPort(): Promise<number> {
	const reservation = Bun.serve({
		port: 0,
		hostname: LOOPBACK_HOST,
		fetch: respondEmpty,
	});
	try {
		return requireReservedPort({ port: reservation.port });
	} finally {
		await reservation.stop();
	}
}

async function createReplayHarness(): Promise<ReplayHarness> {
	const deployment = `replay-hydration-${crypto.randomUUID()}`;
	const topics: ReplayTopics = {
		metering: deployment,
		ownership: `${deployment}-owners`,
	};
	const kafka = new Kafka({
		clientId: deployment,
		brokers: loopbackBrokers,
		logLevel: logLevel.NOTHING,
	});
	const admin = kafka.admin();
	await admin.connect();
	try {
		await admin.createTopics({
			waitForLeaders: true,
			topics: [
				{
					topic: topics.metering,
					numPartitions: PARTITION_COUNT,
					replicationFactor: 1,
				},
				{
					topic: topics.ownership,
					numPartitions: PARTITION_COUNT,
					replicationFactor: 1,
					configEntries: [{ name: "cleanup.policy", value: "compact" }],
				},
			],
		});
	} catch (cause) {
		await admin.disconnect();
		throw cause;
	}
	const routing = createOwnershipConsumer({
		ctx: { kafka },
		config: { topic: topics.ownership },
	});
	async function stop(): Promise<void> {
		await routing.stop();
		await admin.deleteTopics({
			topics: [topics.metering, topics.ownership],
		});
		await admin.disconnect();
	}
	return { topics, deployment, routing, stop };
}

async function startReplayHarness(): Promise<ReplayHarness> {
	const harness = await createReplayHarness();
	try {
		await harness.routing.start();
	} catch (cause) {
		await harness.stop();
		throw cause;
	}
	return harness;
}

async function createReplayScope(): Promise<ReplayScope> {
	return {
		harness: await startReplayHarness(),
		workers: [],
		coordinators: [],
		baselineSource: createRecordingReplaySource(),
	};
}

async function startBalanceWorkerFixture({
	topics,
	deployment,
}: {
	topics: ReplayTopics;
	deployment: string;
}): Promise<WorkerFixture> {
	const directory = mkdtempSync(join(tmpdir(), "balance-replay-"));
	const databasePath = join(directory, "state.sqlite");
	const env = {
		...createBalanceWorkerEnv({
			KAFKA_BROKERS: brokerList,
			KAFKA_AUTH_MODE: "none",
			BALANCE_WORKER_HOST: LOOPBACK_HOST,
			BALANCE_WORKER_PORT: String(await reserveLoopbackPort()),
			BALANCE_WORKER_SQLITE_PATH: databasePath,
			BALANCE_WORKER_METERING_TOPIC: topics.metering,
			BALANCE_WORKER_OWNERSHIP_TOPIC: topics.ownership,
			BALANCE_WORKER_GROUP_ID: deployment,
			BALANCE_WORKER_DEPLOYMENT: deployment,
		}),
		BALANCE_WORKER_PARTITION_COUNT: PARTITION_COUNT,
	};
	const errors: unknown[] = [];
	function recordError({ cause }: { cause: unknown }): void {
		errors.push(cause);
	}
	const worker = await createBalanceWorker({
		ctx: {
			onError: recordError,
			logger: { info: ignoreLog, warn: ignoreLog, error: ignoreLog },
		},
		config: { env },
	});
	let released = false;
	async function stop(): Promise<void> {
		await worker.stop();
		if (released) return;
		released = true;
		rmSync(directory, { recursive: true, force: true });
	}
	try {
		await worker.start();
	} catch (cause) {
		await stop();
		throw cause;
	}
	return {
		endpoint: env.BALANCE_WORKER_ENDPOINT,
		databasePath,
		errors,
		stop,
	};
}

/** Waits for the endpoint of the worker under test, never a stale predecessor. */
async function awaitCurrentOwner({
	routing,
	endpoint,
}: {
	routing: OwnershipConsumer;
	endpoint: string;
}): Promise<PartitionOwner> {
	for (let attempt = 0; attempt < OWNERSHIP_POLL_ATTEMPTS; attempt++) {
		await routing.refresh();
		const owner = routing.findOwner({ partition: METERING_PARTITION });
		if (owner?.endpoint === endpoint) return owner;
		await Bun.sleep(OWNERSHIP_POLL_INTERVAL_MS);
	}
	throw new Error(
		`Partition ${METERING_PARTITION} never advertised ${endpoint}`,
	);
}

async function startReplayWorker({
	scope,
}: {
	scope: ReplayScope;
}): Promise<WorkerFixture> {
	const fixture = await startBalanceWorkerFixture({
		topics: scope.harness.topics,
		deployment: scope.harness.deployment,
	});
	scope.workers.push(fixture);
	await awaitCurrentOwner({
		routing: scope.harness.routing,
		endpoint: fixture.endpoint,
	});
	return fixture;
}

function createReplayCoordinator({
	scope,
	source,
}: {
	scope: ReplayScope;
	source: BalanceHydrationSource;
}): BalanceHydrationCoordinator {
	const coordinator = createBalanceHydrationCoordinator({
		source,
		client: createBalanceWorkerClient({
			ctx: { owners: scope.harness.routing },
			config: {
				partitionCount: PARTITION_COUNT,
				timeoutMs: CLIENT_TIMEOUT_MS,
			},
		}),
		config: { maxActive: 1, deadlineMs: HYDRATION_DEADLINE_MS },
	});
	scope.coordinators.push(coordinator);
	return coordinator;
}

function readReplayRows({
	databasePath,
}: {
	databasePath: string;
}): PersistedReplayRows {
	const database = new Database(databasePath, { readonly: true });
	try {
		return {
			state: database.query("SELECT revision FROM customer_states").get(),
			receipts: database
				.query("SELECT COUNT(*) AS count FROM track_receipts")
				.get(),
		};
	} finally {
		database.close();
	}
}

async function expectCheckedBalance({
	coordinator,
	requestId,
}: {
	coordinator: BalanceHydrationCoordinator;
	requestId: string;
}): Promise<void> {
	const decision = await coordinator.check({
		selection: REPLAY_SELECTION,
		command: createReplayCheckCommand({ requestId }),
	});
	expect(decision.kind).toBe("decided");
	if (decision.kind !== "decided") throw new Error("Expected a decided check");
	expect(decision.allowed).toBe(true);
	expect(decision.balance).toBe(BALANCE_AFTER_TRACK);
	expect(decision.revision).toBe(REVISION_AFTER_TRACK);
	expect(decision.balanceSnapshot.usage).toBe(USAGE_AFTER_TRACK);
}

async function retireReplayRuntime({
	scope,
}: {
	scope: ReplayScope;
}): Promise<void> {
	for (const coordinator of scope.coordinators) await coordinator.close();
	for (const worker of scope.workers) await worker.stop();
	scope.coordinators.length = 0;
	scope.workers.length = 0;
}

async function releaseReplayScope({
	scope,
}: {
	scope: ReplayScope;
}): Promise<void> {
	const settled = await Promise.allSettled([
		...scope.coordinators.map((coordinator) => coordinator.close()),
		...scope.workers.map((worker) => worker.stop()),
	]);
	await scope.harness.stop();
	const failure = settled.find(isRejectedResult);
	if (failure) throw failure.reason;
}

/** Cold customer, empty topic: the coordinator must initialize before it tracks. */
async function hydrateColdCustomerFromSource({
	scope,
}: {
	scope: ReplayScope;
}): Promise<void> {
	const worker = await startReplayWorker({ scope });
	const coordinator = createReplayCoordinator({
		scope,
		source: scope.baselineSource.source,
	});
	const command = createReplayTrackCommand();
	const tracked = await coordinator.track({
		selection: REPLAY_SELECTION,
		command,
	});
	expect(tracked.kind).toBe("new");
	if (tracked.kind !== "new") throw new Error("Expected a new track decision");
	expect(tracked.outcome.status).toBe("applied");
	expect(tracked.outcome.balanceBefore).toBe(BASELINE_BALANCE);
	expect(tracked.outcome.balanceAfter).toBe(BALANCE_AFTER_TRACK);
	expect(tracked.outcome.revisionAfter).toBe(REVISION_AFTER_TRACK);
	scope.firstOutcome = tracked.outcome;
	await expectCheckedBalance({
		coordinator,
		requestId: "replay-hydration-check-hydrated",
	});
	const duplicate = await coordinator.track({
		selection: REPLAY_SELECTION,
		command,
	});
	expect(duplicate.kind).toBe("duplicate");
	if (duplicate.kind !== "duplicate")
		throw new Error("Expected a duplicate track decision");
	expect(duplicate.outcome).toEqual(tracked.outcome);
	expect(scope.baselineSource.readLoadCount()).toBe(1);
	expect(readReplayRows({ databasePath: worker.databasePath })).toEqual({
		state: { revision: REVISION_AFTER_TRACK },
		receipts: { count: 1 },
	});
	expect(worker.errors).toEqual([]);
}

/** Same topic, same deployment, empty SQLite: recovery must rebuild state and receipts. */
async function serveReplayFromKafkaLogAfterRestart({
	scope,
}: {
	scope: ReplayScope;
}): Promise<void> {
	const recorded = scope.firstOutcome;
	if (!recorded)
		throw new Error("Cold hydration must record the first outcome");
	await retireReplayRuntime({ scope });
	const worker = await startReplayWorker({ scope });
	const coordinator = createReplayCoordinator({
		scope,
		source: createForbiddenReplaySource(),
	});
	await expectCheckedBalance({
		coordinator,
		requestId: "replay-hydration-check-recovered",
	});
	const duplicate = await coordinator.track({
		selection: REPLAY_SELECTION,
		command: createReplayTrackCommand(),
	});
	expect(duplicate.kind).toBe("duplicate");
	if (duplicate.kind !== "duplicate")
		throw new Error("Expected a duplicate track decision");
	expect(duplicate.outcome).toEqual(recorded);
	expect(readReplayRows({ databasePath: worker.databasePath })).toEqual({
		state: { revision: REVISION_AFTER_TRACK },
		receipts: { count: 1 },
	});
	expect(worker.errors).toEqual([]);
}

async function proveReplayHydrationAcrossWorkerRestart(): Promise<void> {
	const scope = await createReplayScope();
	try {
		await hydrateColdCustomerFromSource({ scope });
		await serveReplayFromKafkaLogAfterRestart({ scope });
	} finally {
		await releaseReplayScope({ scope });
	}
}

describe("Replay hydration against a real balance worker", () => {
	test(
		"hydrates a cold customer once, then serves check and duplicate track from the Kafka log after a restart",
		proveReplayHydrationAcrossWorkerRestart,
		TEST_TIMEOUT_MS,
	);
});
