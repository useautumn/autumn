import type {
	RingFrame,
	RingReader,
	RingWriter,
} from "../../../threads/ring/types/ring.js";

export const REPLY_FRAME = 2;
const HEADER_BYTES = 20;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export type ReplyFrame = {
	reqId: number;
	status: number;
	partition: number;
	heldUntilSeq: number;
	headers: [string, string][];
	body: Uint8Array;
};

export const replyFrameMaxLength = ({
	metaText,
	body,
}: {
	metaText: string;
	body: Uint8Array;
}): number => HEADER_BYTES + metaText.length * 3 + body.length;

export const writeReplyFrame = ({
	writer,
	reqId,
	status,
	partition = 0,
	heldUntilSeq = 0,
	metaText,
	body,
}: {
	writer: RingWriter;
	reqId: number;
	status: number;
	partition?: number;
	heldUntilSeq?: number;
	metaText: string;
	body: Uint8Array;
}): boolean => {
	const maxLength = replyFrameMaxLength({ metaText, body });
	const at = writer.claim({ type: REPLY_FRAME, maxLength });
	if (at < 0) return false;
	writer.view.setUint32(at, reqId, true);
	writer.view.setUint16(at + 4, status, true);
	writer.view.setUint16(at + 6, partition, true);
	writer.view.setFloat64(at + 8, heldUntilSeq, true);
	const { written } = encoder.encodeInto(
		metaText,
		writer.bytes.subarray(at + HEADER_BYTES, at + maxLength - body.length),
	);
	writer.view.setUint32(at + 16, written, true);
	writer.bytes.set(body, at + HEADER_BYTES + written);
	writer.publish({ length: HEADER_BYTES + written + body.length });
	return true;
};

export const readReplyFrame = ({
	reader,
	frame,
}: {
	reader: RingReader;
	frame: RingFrame;
}): ReplyFrame => {
	const reqId = reader.view.getUint32(frame.offset, true);
	const status = reader.view.getUint16(frame.offset + 4, true);
	const partition = reader.view.getUint16(frame.offset + 6, true);
	const heldUntilSeq = reader.view.getFloat64(frame.offset + 8, true);
	const metaLength = reader.view.getUint32(frame.offset + 16, true);
	const { headers } = JSON.parse(
		decoder.decode(
			frame.bytes.subarray(HEADER_BYTES, HEADER_BYTES + metaLength),
		),
	) as { headers: [string, string][] };
	return {
		reqId,
		status,
		partition,
		heldUntilSeq,
		headers,
		body: frame.bytes.slice(HEADER_BYTES + metaLength),
	};
};
