/**
 * A producer thread whose broker is scripted by topic name, so the threaded producers can be tested without Kafka:
 *  echo     → metadata whose logAppendTime carries the record the producer received, as JSON
 *  refuse   → a broker refusal (INVALID_TOPIC_EXCEPTION; nothing appended)
 *  fenced   → librdkafka's own fencing (ERR__FENCED; fate unknown)
 *  electing → a send that timed out through a leader election (ERR__MSG_TIMED_OUT, retriable; fate unknown)
 *  crash    → the thread exits
 *  anything else → one metadata entry with a per-partition base offset
 * A clientId of "bad-client" makes the thread fail to start; "scram-client" starts only with its SCRAM credentials.
 */
import type {
	KafkaProducerClient,
	KafkaRequestTiming,
	ProducerConfig,
	ProducerRecord,
	RecordMetadata,
} from "@autumn/kafka";
import { startProducerLoop } from "../../../../src/kafka/producerThread/startProducerLoop.js";
import type {
	DecideToProducerMessage,
	ProducerThreadInit,
} from "../../../../src/kafka/producerThread/types/producerThreadMessages.js";

declare var self: Worker;

type Listener = (timing: KafkaRequestTiming) => void;

/** What Confluent's shim throws: librdkafka's code and verdict on the error itself. */
function librdkafkaError({
	name,
	message,
	code,
	retriable,
}: {
	name: string;
	message: string;
	code: number;
	retriable: boolean;
}): Error {
	const error = Object.assign(new Error(message), { code, retriable });
	error.name = name;
	return error;
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
			config,
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
				apiName: "Produce",
				broker: "fake:9092",
				durationMs: 3,
				pendingMs: 1,
			});
		if (record.topic === "crash") process.exit(7);
		if (record.topic === "refuse")
			throw librdkafkaError({
				name: "KafkaJSProtocolError",
				message:
					"The request attempted to perform an operation on an invalid topic",
				code: 17,
				retriable: false,
			});
		if (record.topic === "fenced")
			throw librdkafkaError({
				name: "KafkaJSError",
				message: "Local: This instance has been fenced by a newer instance",
				code: -144,
				retriable: false,
			});
		if (record.topic === "electing")
			throw librdkafkaError({
				name: "KafkaJSError",
				message: "Local: Message timed out",
				code: -192,
				retriable: true,
			});
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
		onRequestTimings(listener: Listener) {
			listeners.add(listener);
		},
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
