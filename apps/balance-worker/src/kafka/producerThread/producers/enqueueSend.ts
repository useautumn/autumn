import {
	encodeSendMeta,
	SEND_FRAME,
	type SendMeta,
	type SendRecord,
	sendFrameLength,
	writeSendFrame,
} from "../frames/sendFrame.js";
import type { ThreadedProducersScope } from "../types/threadedProducersScope.js";
import { postToProducerThread } from "./postToProducerThread.js";

/** Onto the send ring; too big for it, or the ring is full: the message port, and the thread keeps the order. */
export function enqueueSend({
	scope,
	reqId,
	meta,
	records,
}: {
	scope: ThreadedProducersScope;
	reqId: number;
	meta: SendMeta;
	records: SendRecord[];
}): void {
	const { sends } = scope;
	const metaBytes = encodeSendMeta({ meta });
	const length = sendFrameLength({ metaBytes, records });
	const at =
		length <= sends.maxFrameBytes
			? sends.claim({ type: SEND_FRAME, maxLength: length })
			: -1;
	if (at >= 0) {
		writeSendFrame({ bytes: sends.bytes, at, reqId, metaBytes, records });
		sends.publish({ length });
		sends.flush();
		return;
	}
	const bytes = new Uint8Array(length);
	writeSendFrame({ bytes, at: 0, reqId, metaBytes, records });
	postToProducerThread({
		scope,
		message: { kind: "send", bytes: bytes.buffer },
		transfer: [bytes.buffer],
	});
}
