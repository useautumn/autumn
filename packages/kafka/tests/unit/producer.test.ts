import { expect, test } from "bun:test";
import type { ProducerConfig, ProducerRecord, RecordMetadata } from "kafkajs";
import type {
	KafkaProducerClient,
	KafkaTransaction,
} from "../../src/client/types/kafkaClient.js";
import { createProducerSession } from "../../src/producer/createProducerSession.js";
import { partitionProducerTransactionalIdOf } from "../../src/producer/producerConfig.js";
import { isKafkaProducerFencingCause } from "../../src/producer/producerErrors.js";

const config = {
	transactionalId: partitionProducerTransactionalIdOf({
		prefix: "autumn-balance-worker",
		deploymentEnvironment: "staging/eu-west-1",
		topic: "metering-events-v1",
		partition: 3,
	}),
	limits: {
		transactionTimeoutMs: 15_000,
		retryCount: 3,
		initialRetryTimeMs: 100,
		maxRetryTimeMs: 2_000,
	},
};

type ProducerAction = "connect" | "transaction" | "send" | "commit" | "abort";

function createProducerFixture() {
	const events: string[] = [];
	const receivedConfigs: ProducerConfig[] = [];
	const failures: Partial<Record<ProducerAction, unknown>> = {};
	const waits: Partial<Record<"commit" | "abort", Promise<void>>> = {};
	let transactionCount = 0;

	async function connect(): Promise<void> {
		events.push("connect");
		if (failures.connect) throw failures.connect;
	}

	async function disconnect(): Promise<void> {
		events.push("disconnect");
	}

	async function transaction(): Promise<KafkaTransaction> {
		const sequence = ++transactionCount;
		events.push(`transaction:${sequence}`);
		if (failures.transaction) throw failures.transaction;

		async function send(_record: ProducerRecord): Promise<RecordMetadata[]> {
			events.push(`send:${sequence}`);
			if (failures.send) throw failures.send;
			return [];
		}

		async function commit(): Promise<void> {
			events.push(`commit:${sequence}`);
			await waits.commit;
			if (failures.commit) throw failures.commit;
			events.push(`committed:${sequence}`);
		}

		async function abort(): Promise<void> {
			events.push(`abort:${sequence}`);
			await waits.abort;
			if (failures.abort) throw failures.abort;
			events.push(`aborted:${sequence}`);
		}

		return { send, commit, abort };
	}

	function producer(producerConfig: ProducerConfig): KafkaProducerClient {
		receivedConfigs.push(producerConfig);
		return { connect, disconnect, transaction };
	}

	const kafka = { producer };
	const session = createProducerSession({ ctx: { kafka }, config });
	return { events, receivedConfigs, failures, waits, kafka, session };
}

function usesBoundedSettingsWithoutStarting(): void {
	const fixture = createProducerFixture();
	expect(fixture.events).toEqual([]);
	expect(fixture.session.isUsable()).toBe(false);
	expect(fixture.receivedConfigs).toEqual([
		{
			transactionalId:
				"autumn-balance-worker:staging%2Feu-west-1:metering-events-v1:3",
			idempotent: true,
			maxInFlightRequests: 1,
			transactionTimeout: 15_000,
			retry: {
				retries: 3,
				initialRetryTime: 100,
				maxRetryTime: 2_000,
			},
		},
	]);
}

function rejectsUnboundedRetriesBeforeConstructing(): void {
	const fixture = createProducerFixture();
	function createUnboundedSession(): void {
		createProducerSession({
			ctx: { kafka: fixture.kafka },
			config: {
				...config,
				limits: {
					...config.limits,
					retryCount: Number.MAX_SAFE_INTEGER - 1,
				},
			},
		});
	}
	expect(createUnboundedSession).toThrow("retryCount");
	expect(fixture.receivedConfigs).toHaveLength(1);
}

async function fencesOnceAndCannotReconnectAfterClosing(): Promise<void> {
	const { session, events } = createProducerFixture();
	const { connect, fence, disconnect } = session;
	await connect();
	expect(session.isUsable()).toBe(false);
	await fence();
	expect(session.isUsable()).toBe(true);
	await expect(fence()).rejects.toThrow("already initialized");
	expect(session.isUsable()).toBe(true);
	await disconnect();
	expect(session.isUsable()).toBe(false);
	await expect(connect()).rejects.toThrow("cannot reconnect");
	expect(events).toEqual([
		"connect",
		"transaction:1",
		"abort:1",
		"aborted:1",
		"disconnect",
	]);
}

async function serializesUntilCommitSettles(): Promise<void> {
	const { session, events, waits } = createProducerFixture();
	const committed = Promise.withResolvers<void>();
	waits.commit = committed.promise;
	const first = await session.transaction();
	const second = session.transaction();
	await first.send({ topic: "events", messages: [] });
	const committing = first.commit();
	await Promise.resolve();
	expect(events).toEqual(["transaction:1", "send:1", "commit:1"]);
	committed.resolve();
	await committing;
	const next = await second;
	expect(events).toEqual([
		"transaction:1",
		"send:1",
		"commit:1",
		"committed:1",
		"transaction:2",
	]);
	await next.abort();
	await session.disconnect();
}

async function serializesAbortAndPreservesRecoverableSends(): Promise<void> {
	const { session, events, waits, failures } = createProducerFixture();
	await session.fence();
	const cause = new Error("send rejected");
	failures.send = cause;
	const first = await session.transaction();
	await expect(first.send({ topic: "events", messages: [] })).rejects.toBe(
		cause,
	);
	expect(session.isUsable()).toBe(true);
	const aborted = Promise.withResolvers<void>();
	waits.abort = aborted.promise;
	const second = session.transaction();
	const aborting = first.abort();
	await Promise.resolve();
	expect(events).not.toContain("transaction:3");
	aborted.resolve();
	await aborting;
	const next = await second;
	expect(events.indexOf("aborted:2")).toBeLessThan(
		events.indexOf("transaction:3"),
	);
	await next.abort();
	expect(session.isUsable()).toBe(true);
	await session.disconnect();
}

async function terminalFailuresKeepOriginalCauses(): Promise<void> {
	const actions: ProducerAction[] = [
		"connect",
		"transaction",
		"send",
		"commit",
		"abort",
	];
	for (const action of actions) {
		const { session, failures } = createProducerFixture();
		if (action !== "connect") await session.fence();
		const cause = new Error(`${action} failed`);
		if (action === "send") Object.assign(cause, { type: "PRODUCER_FENCED" });
		failures[action] = cause;
		if (action === "connect") {
			await expect(session.connect()).rejects.toBe(cause);
		} else if (action === "transaction") {
			await expect(session.transaction()).rejects.toBe(cause);
		} else {
			const current = await session.transaction();
			if (action === "send") {
				await expect(
					current.send({ topic: "events", messages: [] }),
				).rejects.toBe(cause);
				await current.abort();
			} else {
				await expect(current[action]()).rejects.toBe(cause);
			}
		}
		expect(session.isUsable()).toBe(false);
		await expect(session.connect()).rejects.toThrow("cannot reconnect");
		await expect(session.transaction()).rejects.toThrow("unavailable");
		await session.disconnect();
	}
}

async function rejectsQueuedTransactionsBeforeDisconnecting(): Promise<void> {
	const { session, events, waits } = createProducerFixture();
	const committed = Promise.withResolvers<void>();
	waits.commit = committed.promise;
	const first = await session.transaction();
	const queued = Promise.allSettled([session.transaction()]);
	const disconnecting = session.disconnect();
	const committing = first.commit();
	await Promise.resolve();
	expect(events).toEqual(["transaction:1", "commit:1"]);
	committed.resolve();
	await committing;
	expect(await queued).toMatchObject([
		{
			status: "rejected",
			reason: { message: "Producer session is unavailable" },
		},
	]);
	await disconnecting;
	expect(events).toEqual([
		"transaction:1",
		"commit:1",
		"committed:1",
		"disconnect",
	]);
}

async function failedFenceCannotReinitialize(): Promise<void> {
	const { session, failures, events } = createProducerFixture();
	const cause = new Error("fencing abort failed");
	failures.abort = cause;
	await expect(session.fence()).rejects.toBe(cause);
	expect(session.isUsable()).toBe(false);
	delete failures.abort;
	await expect(session.fence()).rejects.toThrow("unavailable");
	await session.disconnect();
	expect(events).toEqual(["transaction:1", "abort:1", "disconnect"]);
}

async function disconnectsWithoutRepeatingTheRuntimeDrain(): Promise<void> {
	const { session, events, waits } = createProducerFixture();
	const committed = Promise.withResolvers<void>();
	waits.commit = committed.promise;
	await session.fence();
	const transaction = await session.transaction();
	const committing = transaction.commit();
	const queued = Promise.allSettled([session.transaction()]);
	try {
		await session.disconnect({ waitForTransactions: false });
		expect(events.at(-1)).toBe("disconnect");
		expect(events).not.toContain("committed:2");
		expect(session.isUsable()).toBe(false);
	} finally {
		committed.resolve();
		await committing;
	}
	expect(await queued).toMatchObject([
		{
			status: "rejected",
			reason: { message: "Producer session is unavailable" },
		},
	]);
	expect(events).not.toContain("transaction:3");
}

test(
	"runtime disposal can disconnect unsettled work without reopening queued transactions",
	disconnectsWithoutRepeatingTheRuntimeDrain,
);

test(
	"constructs bounded producer settings without connecting or fencing",
	usesBoundedSettingsWithoutStarting,
);
test(
	"rejects unbounded producer retries before construction",
	rejectsUnboundedRetriesBeforeConstructing,
);
test(
	"fences once and cannot reconnect after closing",
	fencesOnceAndCannotReconnectAfterClosing,
);
test(
	"serializes the whole transaction until commit settles",
	serializesUntilCommitSettles,
);
test(
	"serializes abort while keeping a recoverable send usable",
	serializesAbortAndPreservesRecoverableSends,
);
test(
	"terminal failures propagate their original causes",
	terminalFailuresKeepOriginalCauses,
);
test(
	"disconnect waits for active work and rejects queued transactions",
	rejectsQueuedTransactionsBeforeDisconnecting,
);
test(
	"a failed fence never reinitializes the session",
	failedFenceCannotReinitialize,
);

function recognizesAllFencingTypesAndCodes(): void {
	for (const type of [
		"INVALID_PRODUCER_EPOCH",
		"INVALID_PRODUCER_ID_MAPPING",
		"PRODUCER_FENCED",
	]) {
		expect(isKafkaProducerFencingCause({ cause: { type } })).toBe(true);
	}
	for (const code of [47, 49, 90]) {
		expect(isKafkaProducerFencingCause({ cause: { code } })).toBe(true);
	}
}

function traversesNestedAndCyclicCauses(): void {
	const cause: { cause?: unknown; errors?: unknown[] } = {};
	cause.cause = cause;
	cause.errors = [null, "PRODUCER_FENCED", { abortCause: { code: 90 } }];
	expect(isKafkaProducerFencingCause({ cause })).toBe(true);
	cause.errors = [null, "PRODUCER_FENCED", { code: "90" }];
	expect(isKafkaProducerFencingCause({ cause })).toBe(false);
	expect(
		isKafkaProducerFencingCause({ cause: { type: "REQUEST_TIMED_OUT" } }),
	).toBe(false);
}

test(
	"recognizes every supported Kafka fencing type and code",
	recognizesAllFencingTypesAndCodes,
);
test(
	"traverses nested errors without cycling or accepting unrelated causes",
	traversesNestedAndCyclicCauses,
);
