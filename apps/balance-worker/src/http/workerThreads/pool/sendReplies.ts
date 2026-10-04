/** Replies on their way back: written to the lane's reply ring in order, made visible once per turn. */
import { replyFrameMaxLength, writeReplyFrame } from "../frames/replyFrame.js";
import type { HttpWorkerLane, PendingReply } from "../types/httpWorkerLane.js";
import type { HttpWorkerPoolScope } from "../types/httpWorkerPoolScope.js";
import type { DecideThreadMessage } from "../types/httpWorkerThread.js";
import { reportPoolFailure } from "./reportPoolFailure.js";

function flushDirtyLanes({ scope }: { scope: HttpWorkerPoolScope }): void {
	scope.state.flushScheduled = false;
	for (const lane of scope.state.lanes) {
		if (!lane.dirty) continue;
		lane.dirty = false;
		lane.replies.flush();
	}
}

function scheduleFlush({ scope }: { scope: HttpWorkerPoolScope }): void {
	if (scope.state.flushScheduled) return;
	scope.state.flushScheduled = true;
	setImmediate(flushDirtyLanes, { scope });
}

/** Writes queued replies in order; a full ring waits for the thread to read, then carries on. */
async function pump({
	scope,
	lane,
}: {
	scope: HttpWorkerPoolScope;
	lane: HttpWorkerLane;
}): Promise<void> {
	lane.pumping = true;
	try {
		while (lane.outbox.length > 0 && !scope.state.stopping) {
			const reply = lane.outbox[0] as PendingReply;
			if (writeReplyFrame({ writer: lane.replies, ...reply })) {
				lane.outbox.shift();
				lane.dirty = true;
				scheduleFlush({ scope });
				continue;
			}
			flushDirtyLanes({ scope });
			await lane.replies.waitForRoom({
				maxLength: replyFrameMaxLength(reply),
			});
		}
	} finally {
		lane.pumping = false;
	}
}

export function replyToLane({
	scope,
	lane,
	reqId,
	response,
	body,
}: {
	scope: HttpWorkerPoolScope;
	lane: HttpWorkerLane;
	reqId: number;
	response: Response;
	body: Uint8Array;
}): void {
	const headers: [string, string][] = [];
	response.headers.forEach((value, name) => {
		headers.push([name, value]);
	});
	const metaText = JSON.stringify({ headers });
	// A reply over an eighth of the ring could need more contiguous room than the ring can ever free.
	if (
		replyFrameMaxLength({ metaText, body }) >
		scope.config.replyRingBytes >>> 3
	) {
		// Transferred, so the bytes must be a buffer of their own.
		const buffer = body.slice().buffer;
		const message: DecideThreadMessage = {
			kind: "reply",
			reqId,
			status: response.status,
			headers,
			body: buffer,
		};
		lane.thread.postMessage(message, [buffer]);
		return;
	}
	lane.outbox.push({ reqId, status: response.status, metaText, body });
	if (!lane.pumping)
		pump({ scope, lane }).catch((cause) => reportPoolFailure({ scope, cause }));
}
