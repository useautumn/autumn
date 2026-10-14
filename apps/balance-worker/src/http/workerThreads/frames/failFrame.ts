import type {
	RingFrame,
	RingReader,
	RingWriter,
} from "../../../threads/ring/types/ring.js";

export const FAIL_FRAME = 3;
const HEADER_BYTES = 20;

export type FailFrame = {
	partition: number;
	aboveSeq: number;
	lastSeq: number;
	status: number;
	body: Uint8Array;
};

export const failFrameLength = ({ body }: { body: Uint8Array }): number =>
	HEADER_BYTES + body.length;

export const writeFailFrame = ({
	writer,
	fail,
}: {
	writer: RingWriter;
	fail: FailFrame;
}): boolean => {
	const length = failFrameLength(fail);
	const at = writer.claim({ type: FAIL_FRAME, maxLength: length });
	if (at < 0) return false;
	writer.view.setUint16(at, fail.partition, true);
	writer.view.setFloat64(at + 2, fail.aboveSeq, true);
	writer.view.setFloat64(at + 10, fail.lastSeq, true);
	writer.view.setUint16(at + 18, fail.status, true);
	writer.bytes.set(fail.body, at + HEADER_BYTES);
	writer.publish({ length });
	return true;
};

export const readFailFrame = ({
	reader,
	frame,
}: {
	reader: RingReader;
	frame: RingFrame;
}): FailFrame => ({
	partition: reader.view.getUint16(frame.offset, true),
	aboveSeq: reader.view.getFloat64(frame.offset + 2, true),
	lastSeq: reader.view.getFloat64(frame.offset + 10, true),
	status: reader.view.getUint16(frame.offset + 18, true),
	body: frame.bytes.slice(HEADER_BYTES, frame.length),
});
