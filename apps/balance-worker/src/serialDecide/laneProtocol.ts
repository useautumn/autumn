/**
 * The lane between the main thread and the Kafka worker (serial-decide arms C and D).
 *
 * Frozen on day 1 of the port (handoffs/ATMN-602/port-plan.md). Control messages go by `postMessage`;
 * record bytes go over SharedArrayBuffer rings as frames, with `postMessage` as the fallback for a
 * payload the ring cannot hold. Every request carries a `reqId` the reply echoes.
 *
 *  main → worker (ring)   SEND  [u32 reqId][u32 metaLen][meta json SendMeta][count × record frame]
 *                                 record frame: [u8 kind][u32 aLen][a bytes][u32 bLen][b bytes]
 *                                   kind REC_JSON   a = key,          b = value   (S1: what ships today)
 *                                   kind REC_SPLICE a = commandBytes, b = decisionBytes (S5, ATMN-603: the
 *                                                   worker assembles {key, value} = assembleRecord(a, b))
 *                                 a length of NULL_BYTES means a null key or value.
 *  worker → main (ring)   ACK   [u32 reqId][json SendAck]
 */
import type { ProducerConfig, RecordMetadata } from "kafkajs";
import type { RingLayout } from "./ring.js";

export const LANE = { SEND: 1, ACK: 2 } as const;
export const LANE_FRAME = { REC_JSON: 1, REC_SPLICE: 2 } as const;
export const SEND_HEADER_BYTES = 8;
export const ACK_HEADER_BYTES = 4;
const RECORD_FRAME_HEADER_BYTES = 9;
export const NULL_BYTES = 0xffffffff;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export type SendMessageMeta = {
	partition?: number;
	headers?: Record<string, string>;
};

export type SendMeta = {
	producerId: number;
	/** The producer's send order; the worker dispatches in it whichever path a payload took. */
	seq: number;
	topic: string;
	acks?: number;
	compression?: number;
	timeout?: number;
	/** Every record's partition and headers when they are all the same; otherwise `messages` lists them. */
	shared?: SendMessageMeta;
	messages?: SendMessageMeta[];
	count: number;
};

export type LaneRecord = { key: Uint8Array | null; value: Uint8Array | null };

/** A failure crosses as data; the main thread rebuilds the class the writer's error split expects. */
export type LaneError = {
	/** `protocol` → `KafkaJSProtocolError` (proven uncommitted); anything else → `KafkaJSError` (fate unknown). */
	kind: "protocol" | "other";
	name: string;
	message: string;
	type?: string;
	code?: number;
	retriable: boolean;
	/** Nested causes keep their type and code, so fencing detection (`isKafkaProducerFencingCause`) still walks them. */
	cause?: LaneError;
	errors?: LaneError[];
};

export type SendAck =
	| { ok: true; metadata: RecordMetadata[] }
	| { ok: false; error: LaneError };

/** The structured-clone-safe part of a kafkajs `ProducerConfig`; the worker adds the partitioner back. */
export type ProducerConfigSnapshot = Pick<
	ProducerConfig,
	| "transactionalId"
	| "idempotent"
	| "maxInFlightRequests"
	| "allowAutoTopicCreation"
	| "retry"
	| "transactionTimeout"
	| "metadataMaxAge"
> & { explicitPartitioner: boolean };

export type KafkaWorkerInit = {
	/** The main thread's client inputs, rebuilt inside the worker: brokers, auth mode, region, limits. */
	clientId: string;
	brokers: string[];
	authMode: "none" | "msk_iam";
	region?: string;
	limits: {
		connectionTimeoutMs: number;
		requestTimeoutMs: number;
		retryCount: number;
		initialRetryTimeMs: number;
		maxRetryTimeMs: number;
	};
	sendRing: RingLayout;
	ackRing: RingLayout;
	sendBell: SharedArrayBuffer;
	ackBell: SharedArrayBuffer;
};

export type MainToKafkaMessage =
	| { kind: "create"; producerId: number; config: ProducerConfigSnapshot }
	| { kind: "connect"; producerId: number; reqId: number }
	| { kind: "disconnect"; producerId: number; reqId: number }
	/** A SEND payload too big for the ring, or sent while the ring was full. */
	| { kind: "send"; bytes: ArrayBuffer }
	| { kind: "stop" };

export type KafkaRequestEvent = {
	producerId: number;
	apiName: string;
	broker: string;
	durationMs: number;
	pendingMs: number;
};

export type KafkaToMainMessage =
	| { kind: "ready" }
	| { kind: "error"; message: string }
	| { kind: "done"; reqId: number }
	| { kind: "failed"; reqId: number; error: LaneError }
	/** One per broker request a producer made, for `kafkaRequestTimings`. */
	| { kind: "request"; event: KafkaRequestEvent }
	| { kind: "token"; info: unknown }
	| { kind: "stopped" };

/** Bytes a SEND payload takes, so a ring slot can be claimed before anything is written. */
export function sendByteLength({
	metaBytes,
	records,
}: {
	metaBytes: Uint8Array;
	records: readonly LaneRecord[];
}): number {
	let length = SEND_HEADER_BYTES + metaBytes.length;
	for (const record of records) {
		length +=
			RECORD_FRAME_HEADER_BYTES +
			(record.key?.length ?? 0) +
			(record.value?.length ?? 0);
	}
	return length;
}

export function encodeSendMeta({ meta }: { meta: SendMeta }): Uint8Array {
	return encoder.encode(JSON.stringify(meta));
}

/** Writes one SEND payload at `at` and returns the bytes written. */
export function writeSend({
	bytes,
	at,
	reqId,
	metaBytes,
	records,
}: {
	bytes: Uint8Array;
	at: number;
	reqId: number;
	metaBytes: Uint8Array;
	records: readonly LaneRecord[];
}): number {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	view.setUint32(at, reqId, true);
	view.setUint32(at + 4, metaBytes.length, true);
	bytes.set(metaBytes, at + SEND_HEADER_BYTES);
	let cursor = at + SEND_HEADER_BYTES + metaBytes.length;
	for (const record of records) {
		bytes[cursor] = LANE_FRAME.REC_JSON;
		cursor++;
		cursor = writeField({ bytes, view, at: cursor, field: record.key });
		cursor = writeField({ bytes, view, at: cursor, field: record.value });
	}
	return cursor - at;
}

function writeField({
	bytes,
	view,
	at,
	field,
}: {
	bytes: Uint8Array;
	view: DataView;
	at: number;
	field: Uint8Array | null;
}): number {
	if (field === null) {
		view.setUint32(at, NULL_BYTES, true);
		return at + 4;
	}
	view.setUint32(at, field.length, true);
	bytes.set(field, at + 4);
	return at + 4 + field.length;
}

/** Reads a SEND payload; the records are copies, so the ring slot can be released at once. */
export function readSend({ bytes }: { bytes: Uint8Array }): {
	reqId: number;
	meta: SendMeta;
	records: { key: Buffer | null; value: Buffer | null }[];
} {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const reqId = view.getUint32(0, true);
	const metaLength = view.getUint32(4, true);
	const meta = JSON.parse(
		decoder.decode(
			bytes.subarray(SEND_HEADER_BYTES, SEND_HEADER_BYTES + metaLength),
		),
	) as SendMeta;
	const records: { key: Buffer | null; value: Buffer | null }[] = [];
	let cursor = SEND_HEADER_BYTES + metaLength;
	for (let index = 0; index < meta.count; index++) {
		const kind = bytes[cursor];
		if (kind !== LANE_FRAME.REC_JSON)
			throw new Error(`Kafka lane: unexpected record frame ${kind}`);
		cursor++;
		const key = readField({ bytes, view, at: cursor });
		cursor = key.next;
		const value = readField({ bytes, view, at: cursor });
		cursor = value.next;
		records.push({ key: key.field, value: value.field });
	}
	return { reqId, meta, records };
}

function readField({
	bytes,
	view,
	at,
}: {
	bytes: Uint8Array;
	view: DataView;
	at: number;
}): { field: Buffer | null; next: number } {
	const length = view.getUint32(at, true);
	if (length === NULL_BYTES) return { field: null, next: at + 4 };
	return {
		field: Buffer.from(bytes.subarray(at + 4, at + 4 + length)),
		next: at + 4 + length,
	};
}

export function encodeAck({
	reqId,
	ack,
}: {
	reqId: number;
	ack: SendAck;
}): Uint8Array {
	const json = encoder.encode(JSON.stringify(ack));
	const bytes = new Uint8Array(ACK_HEADER_BYTES + json.length);
	new DataView(bytes.buffer).setUint32(0, reqId, true);
	bytes.set(json, ACK_HEADER_BYTES);
	return bytes;
}

export function decodeAck({ bytes }: { bytes: Uint8Array }): {
	reqId: number;
	ack: SendAck;
} {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	return {
		reqId: view.getUint32(0, true),
		ack: JSON.parse(
			decoder.decode(bytes.subarray(ACK_HEADER_BYTES)),
		) as SendAck,
	};
}
