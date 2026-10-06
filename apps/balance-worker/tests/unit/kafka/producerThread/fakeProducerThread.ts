/**
 * A producer thread whose broker is scripted by topic name, so the threaded producers can be tested without Kafka:
 *  echo     → metadata whose logAppendTime carries the record the producer received, as JSON
 *  refuse   → a KafkaJSProtocolError (the broker refused; nothing appended)
 *  fenced   → retries exhausted around INVALID_PRODUCER_EPOCH (fate unknown, fencing cause)
 *  electing → retries exhausted around LEADER_NOT_AVAILABLE (fate unknown, a leader election)
 *  crash    → the thread exits
 *  anything else → one metadata entry with a per-partition base offset
 * A clientId of "bad-client" makes the thread fail to start; "scram-client" starts only with its SCRAM credentials.
 */
import type { KafkaProducerClient } from "@autumn/kafka";
import {
	KafkaJSNumberOfRetriesExceeded,
	KafkaJSProtocolError,
	type ProducerConfig,
	type ProducerRecord,
	type RecordMetadata,
} from "kafkajs";
import { startProducerLoop } from "../../../../src/kafka/producerThread/startProducerLoop.js";
import type {
	DecideToProducerMessage,
	ProducerThreadInit,
} from "../../../../src/kafka/producerThread/types/producerThreadMessages.js";

declare var self: Worker;

type Listener = (event: { payload: Record<string, unknown> }) => void;

function protocolError({
	message,
	type,
	code,
}: {
	message: string;
	type: string;
	code: number;
}): KafkaJSProtocolError {
	return new KafkaJSProtocolError(
		Object.assign(new Error(message), { type, code, retriable: false }),
	);
}

function fakeProducer({
	config,
}: {
	config: ProducerConfig;
}): KafkaProducerClient {
	const offsets = new Map<string, number>();
	const listeners = new Set<Listener>();
	let connected = false;

	function echoOf({ record }: { record: ProducerRecord }): string {
		return JSON.stringify({
			config: { ...config, createPartitioner: typeof config.createPartitioner },
			acks: record.acks,
			compression: record.compression,
			messages: record.messages.map((message) => ({
				key: message.key === null ? null : String(message.key),
				value: message.value === null ? null : String(message.value),
				partition: message.partition,
				headers: message.headers,
			})),
		});
	}

	async function send(record: ProducerRecord): Promise<RecordMetadata[]> {
		if (!connected) throw new Error("fake producer: not connected");
		for (const listener of listeners)
			listener({
				payload: {
					apiName: "Produce",
					broker: "fake:9092",
					duration: 3,
					pendingDuration: 1,
				},
			});
		if (record.topic === "crash") process.exit(7);
		if (record.topic === "refuse")
			throw protocolError({
				message:
					"The request attempted to perform an operation on an invalid topic",
				type: "INVALID_TOPIC_EXCEPTION",
				code: 17,
			});
		if (record.topic === "fenced")
			throw new KafkaJSNumberOfRetriesExceeded(
				protocolError({
					message: "Producer attempted an operation with an old epoch",
					type: "INVALID_PRODUCER_EPOCH",
					code: 47,
				}),
				{ retryCount: 2, retryTime: 100 },
			);
		if (record.topic === "electing")
			throw new KafkaJSNumberOfRetriesExceeded(
				protocolError({
					message:
						"There is no leader for this topic-partition as we are in the middle of a leadership election",
					type: "LEADER_NOT_AVAILABLE",
					code: 5,
				}),
				{ retryCount: 10, retryTime: 2500 },
			);
		const partition = record.messages[0]?.partition ?? 0;
		const slot = `${record.topic}/${partition}`;
		const baseOffset = offsets.get(slot) ?? 0;
		offsets.set(slot, baseOffset + record.messages.length);
		return [
			{
				topicName: record.topic,
				partition,
				errorCode: 0,
				baseOffset: String(baseOffset),
				...(record.topic === "echo" && { logAppendTime: echoOf({ record }) }),
			},
		];
	}

	return {
		async connect() {
			if (config.transactionalId === "refuse-connect")
				throw new Error("fake producer: connection refused");
			connected = true;
		},
		async disconnect() {
			connected = false;
		},
		send,
		transaction: () => Promise.reject(new Error("no transactions")),
		on: ((_: string, listener: Listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		}) as unknown as KafkaProducerClient["on"],
		events: { REQUEST: "producer.network.request" },
	};
}

let loop: ReturnType<typeof startProducerLoop> | null = null;

self.onmessage = (
	event: MessageEvent<ProducerThreadInit | DecideToProducerMessage>,
) => {
	const message = event.data;
	if ("kind" in message) {
		loop?.receive(message);
		return;
	}
	if (loop) return;
	if (message.clientId === "bad-client") {
		postMessage({ kind: "error", message: "bad client id" });
		return;
	}
	if (
		message.clientId === "scram-client" &&
		(message.authMode !== "scram" || !message.sasl?.password)
	) {
		postMessage({ kind: "error", message: "SCRAM credentials missing" });
		return;
	}
	loop = startProducerLoop({
		ctx: {
			kafka: { producer: (config) => fakeProducer({ config }) },
			post: (reply) => postMessage(reply),
		},
		init: message,
	});
	postMessage({ kind: "ready" });
};
