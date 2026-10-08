/**
 * One `producer.send` crossing to the producer thread:
 * `[u32 reqId][u32 metaLength][meta json][count × ([u32 keyLength][key][u32 valueLength][value])]`.
 * A length of 0xffffffff is a null key or value.
 */
export const SEND_FRAME = 1;
const HEADER_BYTES = 8;
const NULL_BYTES = 0xffffffff;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export type SendMessageMeta = {
	partition?: number;
	headers?: Record<string, string>;
};

export type SendMeta = {
	producerId: number;
	/** The producer's send order; the thread dispatches in it whichever way a payload travelled. */
	seq: number;
	topic: string;
	/** The producer config fixes compression and the delivery timeout; a send only restates its acks. */
	acks?: -1;
	/** Every record's partition and headers when they are all the same; otherwise `messages` lists them. */
	shared?: SendMessageMeta;
	messages?: SendMessageMeta[];
	count: number;
};

export type SendRecord = { key: Uint8Array | null; value: Uint8Array | null };

export type SendFrame = {
	reqId: number;
	meta: SendMeta;
	records: { key: Buffer | null; value: Buffer | null }[];
};

export const encodeSendMeta = ({ meta }: { meta: SendMeta }): Uint8Array =>
	encoder.encode(JSON.stringify(meta));

/** Bytes the frame takes, so a ring slot can be claimed before anything is written. */
export const sendFrameLength = ({
	metaBytes,
	records,
}: {
	metaBytes: Uint8Array;
	records: readonly SendRecord[];
}): number => {
	let length = HEADER_BYTES + metaBytes.length;
	for (const record of records)
		length += 8 + (record.key?.length ?? 0) + (record.value?.length ?? 0);
	return length;
};

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

/** Writes the frame at `at`, into a ring slot or a buffer of its own. */
export const writeSendFrame = ({
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
	records: readonly SendRecord[];
}): void => {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	view.setUint32(at, reqId, true);
	view.setUint32(at + 4, metaBytes.length, true);
	bytes.set(metaBytes, at + HEADER_BYTES);
	let cursor = at + HEADER_BYTES + metaBytes.length;
	for (const record of records) {
		cursor = writeField({ bytes, view, at: cursor, field: record.key });
		cursor = writeField({ bytes, view, at: cursor, field: record.value });
	}
};

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

/** The records are copies, so a ring slot can be released at once. */
export const readSendFrame = ({ bytes }: { bytes: Uint8Array }): SendFrame => {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const reqId = view.getUint32(0, true);
	const metaLength = view.getUint32(4, true);
	const meta = JSON.parse(
		decoder.decode(bytes.subarray(HEADER_BYTES, HEADER_BYTES + metaLength)),
	) as SendMeta;
	const records: SendFrame["records"] = [];
	let cursor = HEADER_BYTES + metaLength;
	for (let index = 0; index < meta.count; index++) {
		const key = readField({ bytes, view, at: cursor });
		const value = readField({ bytes, view, at: key.next });
		cursor = value.next;
		records.push({ key: key.field, value: value.field });
	}
	return { reqId, meta, records };
};
