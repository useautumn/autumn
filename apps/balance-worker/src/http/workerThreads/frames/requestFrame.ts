/**
 * A request crossing from an HTTP worker to the decide thread:
 * `[u32 reqId][u32 metaLength][meta json][body]`, meta = { method, path, headers }.
 */
import type {
	RingFrame,
	RingReader,
	RingWriter,
} from "../../../threads/ring/types/ring.js";

export const REQUEST_FRAME = 1;
const HEADER_BYTES = 8;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export type RequestMeta = {
	method: string;
	/** Path and query, as the client sent them. */
	path: string;
	headers: [string, string][];
};

export type RequestFrame = {
	reqId: number;
	meta: RequestMeta;
	body: Uint8Array;
};

/** The most ring bytes the request can take: a UTF-16 unit of meta encodes to at most three bytes. */
export const requestFrameMaxLength = ({
	metaText,
	body,
}: {
	metaText: string;
	body: Uint8Array;
}): number => HEADER_BYTES + metaText.length * 3 + body.length;

/** False when the ring has no room for it now. */
export const writeRequestFrame = ({
	writer,
	reqId,
	metaText,
	body,
}: {
	writer: RingWriter;
	reqId: number;
	metaText: string;
	body: Uint8Array;
}): boolean => {
	const maxLength = requestFrameMaxLength({ metaText, body });
	const at = writer.claim({ type: REQUEST_FRAME, maxLength });
	if (at < 0) return false;
	writer.view.setUint32(at, reqId, true);
	const { written } = encoder.encodeInto(
		metaText,
		writer.bytes.subarray(at + HEADER_BYTES, at + maxLength - body.length),
	);
	writer.view.setUint32(at + 4, written, true);
	writer.bytes.set(body, at + HEADER_BYTES + written);
	writer.publish({ length: HEADER_BYTES + written + body.length });
	return true;
};

/** The body is copied out, so the frame can be advanced past at once. */
export const readRequestFrame = ({
	reader,
	frame,
}: {
	reader: RingReader;
	frame: RingFrame;
}): RequestFrame => {
	const reqId = reader.view.getUint32(frame.offset, true);
	const metaLength = reader.view.getUint32(frame.offset + 4, true);
	const meta = JSON.parse(
		decoder.decode(
			frame.bytes.subarray(HEADER_BYTES, HEADER_BYTES + metaLength),
		),
	) as RequestMeta;
	return { reqId, meta, body: frame.bytes.slice(HEADER_BYTES + metaLength) };
};
