/** A send's outcome crossing back from the producer thread: `[u32 reqId][json SendAck]`. */
import type { RecordMetadata } from "@autumn/kafka";
import type { ProducerError } from "../types/producerError.js";

export const ACK_FRAME = 2;
const HEADER_BYTES = 4;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export type SendAck =
	| { ok: true; metadata: RecordMetadata[] }
	| { ok: false; error: ProducerError };

export const encodeAckFrame = ({
	reqId,
	ack,
}: {
	reqId: number;
	ack: SendAck;
}): Uint8Array => {
	const json = encoder.encode(JSON.stringify(ack));
	const bytes = new Uint8Array(HEADER_BYTES + json.length);
	new DataView(bytes.buffer).setUint32(0, reqId, true);
	bytes.set(json, HEADER_BYTES);
	return bytes;
};

export const decodeAckFrame = ({
	bytes,
}: {
	bytes: Uint8Array;
}): { reqId: number; ack: SendAck } => ({
	reqId: new DataView(
		bytes.buffer,
		bytes.byteOffset,
		bytes.byteLength,
	).getUint32(0, true),
	ack: JSON.parse(decoder.decode(bytes.subarray(HEADER_BYTES))) as SendAck,
});
