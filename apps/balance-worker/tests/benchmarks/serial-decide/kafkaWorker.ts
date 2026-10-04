/**
 * Kafka worker: the writer's commit loop on its own thread. It takes records off the record ring,
 * lingers and batches exactly as `commitOutcomes` does (one produce in flight per partition), and
 * publishes the commit position. kafkajs encode, gzip, the socket and the transaction bookkeeping all
 * run here, never on the sequencer.
 */
import {
	createKafkaClient,
	createKafkaTransport,
	createProducerSession,
	sendIdempotentBatch,
	sendTransactionalBatch,
} from "@autumn/kafka";
import { Kafka } from "kafkajs";
import { createWorkerProducerConfig } from "../../../src/init/workerConfig.js";
import { createWorkerProducer } from "../../../src/kafka/createWorkerProducer.js";
import { pinFromEnv, threadId } from "./pin.js";
import {
	ACK_BYTES,
	ACK_FAILED_UNCOMMITTED,
	ACK_FAILED_UNKNOWN,
	CELL_COMMIT,
	CELL_FAILED_FROM,
	CELL_FAILED_TO,
	CELL_RECOVERY,
	FRAME,
	type KafkaWorkerInit,
	REC_HEADER,
} from "./protocol.js";
import { Doorbell, RingConsumer, RingProducer } from "./ring.js";

declare var self: Worker;

const TOPIC = process.env.SPIKE_TOPIC ?? "bw-spike-metering";
const BROKERS = ["127.0.0.1:19092"];
const PARTITION = 0;

type Queued = {
	seq: number;
	key: Buffer;
	value: Buffer;
	bytes: number;
	queuedAt: number;
};

self.onmessage = (event: MessageEvent) => {
	void start(event.data as KafkaWorkerInit);
};

async function connectProducer({
	commitMode,
}: {
	commitMode: "transactional" | "idempotent";
}) {
	const kafka = new Kafka(
		createKafkaClient({
			clientId: `bw-serial-${process.pid}`,
			brokers: BROKERS,
			transport: createKafkaTransport({ authMode: "none" }),
			limits: {
				connectionTimeoutMs: 5000,
				requestTimeoutMs: 30000,
				retryCount: 2,
				initialRetryTimeMs: 100,
				maxRetryTimeMs: 1000,
			},
		}),
	);
	const session = createProducerSession({
		ctx: { kafka },
		config: {
			...createWorkerProducerConfig({
				deploymentEnvironment: "spike",
				topic: TOPIC,
				partition: PARTITION,
				limits: {
					transactionTimeoutMs: 30_000,
					retryCount: 8,
					initialRetryTimeMs: 5,
					maxRetryTimeMs: 1000,
				},
			}),
			mode: commitMode,
		},
	});
	const producer = createWorkerProducer({
		ctx: { session, ownerEpoch: () => "1" },
		config: { topic: TOPIC, partition: PARTITION },
	});
	await producer.connect();
	// Transactional: begins and aborts a transaction to bump the epoch. Idempotent: writes the owner fence record.
	await producer.fence();
	return producer;
}

async function start(init: KafkaWorkerInit): Promise<void> {
	const cpus = pinFromEnv({ role: "kafka" });
	const records = new RingConsumer(init.recordRing);
	const recordBell = new Doorbell(init.recordBell);
	const acks = new RingProducer(init.ackRing, new Doorbell(init.sequencerBell));
	const resultBells = init.resultBells.map((sab) => new Doorbell(sab));
	const cells = new Int32Array(init.cells);
	const queue: Queued[] = [];
	let lastBatchSize = 0;
	let simOffset = 0n;
	const stats = {
		batches: 0,
		records: 0,
		maxBatch: 0,
		commitMs: 0,
		lingerMs: 0,
		failed: 0,
		queuedMs: 0,
	};

	const producer =
		init.appender === "kafka"
			? await connectProducer({ commitMode: init.commitMode })
			: null;

	function drainRing(): number {
		let n = 0;
		for (;;) {
			const frame = records.next();
			if (!frame) break;
			if (frame.type !== FRAME.REC)
				throw new Error(`kafka: unexpected frame ${frame.type}`);
			const view = records.payloadView;
			const seq = view.getUint32(frame.offset, true);
			const keyLength = view.getUint32(frame.offset + 4, true);
			// Copies: the ring slot is reused once we advance, and kafkajs keeps the buffers until the send.
			const key = Buffer.from(
				frame.bytes.subarray(REC_HEADER, REC_HEADER + keyLength),
			);
			const value = Buffer.from(frame.bytes.subarray(REC_HEADER + keyLength));
			records.advance();
			queue.push({
				seq,
				key,
				value,
				bytes: key.length + value.length + 256,
				queuedAt: performance.now(),
			});
			n++;
		}
		if (n > 0) records.release();
		return n;
	}

	function takeBatch(): Queued[] {
		let count = 0;
		let bytes = 0;
		for (const item of queue) {
			if (count >= init.maxBatchSize) break;
			if (count > 0 && bytes + item.bytes > init.maxBatchBytes) break;
			bytes += item.bytes;
			count++;
		}
		return queue.splice(0, count);
	}

	/** The writer's linger: only when the last batch carried more than one record and the queue is not full. */
	async function linger(): Promise<void> {
		if (init.lingerMs <= 0 || lastBatchSize <= 1) return;
		if (queue.length >= init.maxBatchSize) return;
		const until = performance.now() + init.lingerMs;
		while (queue.length < init.maxBatchSize) {
			const left = until - performance.now();
			if (left <= 0) break;
			await recordBell.sleep({
				hasWork: () => records.hasWork(),
				timeoutMs: Math.max(1, Math.ceil(left)),
			});
			drainRing();
		}
	}

	function ack({
		from,
		to,
		baseOffset,
	}: {
		from: number;
		to: number;
		baseOffset: bigint;
	}): void {
		const at = acks.claim({ type: FRAME.ACK, maxLength: ACK_BYTES });
		if (at < 0) throw new Error("ack ring full");
		acks.payloadView.setUint32(at, from, true);
		acks.payloadView.setUint32(at + 4, to, true);
		acks.payloadView.setBigInt64(at + 8, baseOffset, true);
		acks.publish({ length: ACK_BYTES });
		if (baseOffset >= 0n) Atomics.store(cells, CELL_COMMIT, to | 0);
		else {
			Atomics.store(cells, CELL_FAILED_FROM, from | 0);
			Atomics.store(cells, CELL_FAILED_TO, to | 0);
			Atomics.store(cells, CELL_RECOVERY, 1);
		}
		acks.flush();
		for (const bell of resultBells) bell.ring();
	}

	async function commit(batch: Queued[]): Promise<void> {
		const from = (batch[0] as Queued).seq;
		const to = (batch[batch.length - 1] as Queued).seq;
		const startedAt = performance.now();
		stats.queuedMs += startedAt - (batch[0] as Queued).queuedAt;
		try {
			let baseOffset: bigint;
			if (!producer) {
				baseOffset = simOffset;
				simOffset += BigInt(batch.length);
			} else {
				({ baseOffset } =
					init.commitMode === "idempotent"
						? await sendIdempotentBatch({
								sender: producer,
								topic: TOPIC,
								partition: PARTITION,
								messages: batch,
								ownerEpoch: "1",
							})
						: await sendTransactionalBatch({
								producer,
								topic: TOPIC,
								partition: PARTITION,
								messages: batch,
							}));
			}
			stats.commitMs += performance.now() - startedAt;
			ack({ from, to, baseOffset });
		} catch (cause) {
			stats.failed++;
			console.error("kafka worker: batch failed", String(cause));
			const unknown = String((cause as Error)?.name ?? "").includes("Unknown");
			ack({
				from,
				to,
				baseOffset: unknown ? ACK_FAILED_UNKNOWN : ACK_FAILED_UNCOMMITTED,
			});
		}
	}

	postMessage({ ready: true, role: "kafka", tid: threadId(), cpus });
	setInterval(
		() => postMessage({ stats: { ...stats, queue: queue.length } }),
		5000,
	).unref();

	for (;;) {
		drainRing();
		if (queue.length === 0) {
			await recordBell.sleep({
				hasWork: () => records.hasWork(),
				timeoutMs: 50,
			});
			continue;
		}
		if (Atomics.load(cells, CELL_RECOVERY) === 1) {
			// Recovery: nothing more commits; every queued record is reported as not committed.
			const batch = queue.splice(0);
			ack({
				from: (batch[0] as Queued).seq,
				to: (batch[batch.length - 1] as Queued).seq,
				baseOffset: ACK_FAILED_UNCOMMITTED,
			});
			continue;
		}
		const lingerStarted = performance.now();
		await linger();
		stats.lingerMs += performance.now() - lingerStarted;
		const batch = takeBatch();
		lastBatchSize = batch.length;
		stats.batches++;
		stats.records += batch.length;
		stats.maxBatch = Math.max(stats.maxBatch, batch.length);
		await commit(batch);
	}
}
