/** Every request's outcome comes back here: ack frames off the ack ring, and control replies by message. */
import { ACK_FRAME, decodeAckFrame, type SendAck } from "../frames/ackFrame.js";
import type { ThreadedProducersScope } from "../types/threadedProducersScope.js";
import { reportProducerThreadFailure } from "./reportProducerThreadFailure.js";

export function awaitAck({
	scope,
	reqId,
}: {
	scope: ThreadedProducersScope;
	reqId: number;
}): Promise<SendAck> {
	const { promise, resolve } = Promise.withResolvers<SendAck>();
	scope.pending.set(reqId, resolve);
	return promise;
}

export function settleAck({
	scope,
	reqId,
	ack,
}: {
	scope: ThreadedProducersScope;
	reqId: number;
	ack: SendAck;
}): void {
	const resolve = scope.pending.get(reqId);
	if (!resolve) {
		scope.ctx.logger.warn(
			`Producer thread answered an unknown request ${reqId}`,
		);
		return;
	}
	scope.pending.delete(reqId);
	resolve(ack);
}

export function drainAcks({
	scope,
}: {
	scope: ThreadedProducersScope;
}): number {
	const { acks } = scope;
	let read = 0;
	for (;;) {
		const frame = acks.next();
		if (!frame) break;
		if (frame.type !== ACK_FRAME)
			throw new Error(`Producer acks: unexpected frame ${frame.type}`);
		const { reqId, ack } = decodeAckFrame({ bytes: frame.bytes });
		acks.advance();
		read++;
		settleAck({ scope, reqId, ack });
	}
	if (read > 0) acks.release();
	return read;
}

async function ackLoop({
	scope,
}: {
	scope: ThreadedProducersScope;
}): Promise<void> {
	const { state, acks } = scope;
	while (!state.stopping && !state.failed) {
		if (drainAcks({ scope }) > 0) {
			// Let the settled sends' continuations run before the next batch.
			await new Promise<void>((resolve) => setImmediate(resolve));
			continue;
		}
		await scope.rings.ackSignal.sleep({ hasWork: acks.hasWork, timeoutMs: 20 });
	}
}

/** A frame the loop cannot read breaks the ring for good: that is fatal. */
export function startAckLoop({
	scope,
}: {
	scope: ThreadedProducersScope;
}): void {
	ackLoop({ scope }).catch(function ackLoopFailed(cause: unknown) {
		reportProducerThreadFailure({ scope, cause });
	});
}
