/** Replies on their way back: written to the lane's reply ring in order, made visible once per turn. */
import { failFrameLength, writeFailFrame } from "../frames/failFrame.js";
import { replyFrameMaxLength, writeReplyFrame } from "../frames/replyFrame.js";
import type { HttpWorkerLane, PendingReply } from "../types/httpWorkerLane.js";
import type { HttpWorkerPoolScope } from "../types/httpWorkerPoolScope.js";
import type { DecideThreadMessage } from "../types/httpWorkerThread.js";
import type { HeldFailure } from "../types/inlineHandler.js";
import { reportPoolFailure } from "./reportPoolFailure.js";

const encoder = new TextEncoder();
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

function write({
	lane,
	pending,
}: {
	lane: HttpWorkerLane;
	pending: PendingReply;
}): boolean {
	if (pending.kind === "fail")
		return writeFailFrame({ writer: lane.replies, fail: pending.fail });
	return writeReplyFrame({ writer: lane.replies, ...pending });
}

function lengthOf(pending: PendingReply): number {
	if (pending.kind === "reply") return replyFrameMaxLength(pending);
	return failFrameLength(pending.fail);
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
			const pending = lane.outbox[0] as PendingReply;
			if (write({ lane, pending })) {
				lane.outbox.shift();
				lane.dirty = true;
				scheduleFlush({ scope });
				continue;
			}
			flushDirtyLanes({ scope });
			scope.state.health.ringFullWaits += 1;
			await lane.replies.waitForRoom({ maxLength: lengthOf(pending) });
		}
	} finally {
		lane.pumping = false;
	}
}

function enqueue({
	scope,
	lane,
	pending,
}: {
	scope: HttpWorkerPoolScope;
	lane: HttpWorkerLane;
	pending: PendingReply;
}): void {
	lane.outbox.push(pending);
	if (!lane.pumping)
		pump({ scope, lane }).catch((cause) => reportPoolFailure({ scope, cause }));
}

function postReply({
	lane,
	reqId,
	status,
	headers,
	body,
}: {
	lane: HttpWorkerLane;
	reqId: number;
	status: number;
	headers: [string, string][];
	body: Uint8Array;
}): void {
	// Transferred, so the bytes must be a buffer of their own.
	const buffer = body.slice().buffer;
	const message: DecideThreadMessage = {
		kind: "reply",
		reqId,
		status,
		headers,
		body: buffer,
	};
	lane.thread.postMessage(message, [buffer]);
}

export function replyToLane({
	scope,
	lane,
	reqId,
	status,
	headers,
	body,
	partition = 0,
	heldUntilSeq = 0,
}: {
	scope: HttpWorkerPoolScope;
	lane: HttpWorkerLane;
	reqId: number;
	status: number;
	headers: [string, string][];
	body: Uint8Array;
	partition?: number;
	heldUntilSeq?: number;
}): void {
	if (heldUntilSeq > 0) scope.state.health.heldReplies += 1;
	const metaText = JSON.stringify({ headers });
	// A reply over an eighth of the ring could need more contiguous room than the ring can ever free.
	if (
		replyFrameMaxLength({ metaText, body }) <=
		scope.config.replyRingBytes >>> 3
	) {
		enqueue({
			scope,
			lane,
			pending: {
				kind: "reply",
				reqId,
				status,
				partition,
				heldUntilSeq,
				metaText,
				body,
			},
		});
		return;
	}
	// The message port can overtake the ring, so a large held reply waits here for its position instead.
	if (heldUntilSeq > 0) {
		scope.state.heldOnDecideThread.push({
			lane,
			reqId,
			partition,
			seq: heldUntilSeq,
			status,
			headers,
			body,
		});
		return;
	}
	postReply({ lane, reqId, status, headers, body });
}

/** Every thread re-checks what it holds; a large held reply the position reached goes out from here. */
export function commitPositionMoved({
	scope,
	partition,
	seq,
}: {
	scope: HttpWorkerPoolScope;
	partition: number;
	seq: number;
}): void {
	for (const lane of scope.state.lanes) lane.replySignal.wake();
	const { state } = scope;
	if (state.heldOnDecideThread.length === 0) return;
	state.heldOnDecideThread = state.heldOnDecideThread.filter((held) => {
		if (held.partition !== partition || held.seq > seq) return true;
		postReply(held);
		return false;
	});
}

/** Behind every reply already queued, so a failure never overtakes a reply it covers. */
export function failHeld({
	scope,
	failure,
}: {
	scope: HttpWorkerPoolScope;
	failure: HeldFailure;
}): void {
	// Without inline routes nothing is held, and a thread treats a FAIL frame it can't hold as fatal.
	if (!scope.config.inline) return;
	scope.state.health.failRanges += 1;
	const { partition, aboveSeq, lastSeq, status } = failure;
	const body = encoder.encode(failure.body);
	for (const lane of scope.state.lanes)
		enqueue({
			scope,
			lane,
			pending: {
				kind: "fail",
				fail: { partition, aboveSeq, lastSeq, status, body },
			},
		});
	const { state } = scope;
	if (state.heldOnDecideThread.length === 0) return;
	state.heldOnDecideThread = state.heldOnDecideThread.filter((held) => {
		const covered =
			held.partition === partition &&
			held.seq > aboveSeq &&
			held.seq <= lastSeq;
		if (!covered) return true;
		postReply({ ...held, status, headers: JSON_HEADERS, body });
		return false;
	});
}

const JSON_HEADERS: [string, string][] = [["content-type", "application/json"]];
