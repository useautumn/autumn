import { readPartitionOffsetAtTimestamp } from "@autumn/kafka";
import type {
	PartitionReplayContext,
	PartitionReplayState,
} from "../types/partitionReplay.js";

/**
 * Where a starting replay seeks: the offset from one window ago, held within the log and
 * never past the bookmark. Best effort: any failure or delay means the bookmark, as before.
 */
export async function readReplayFloor({
	ctx,
	state,
	bookmark,
}: {
	ctx: PartitionReplayContext;
	state: PartitionReplayState;
	bookmark: bigint;
}): Promise<bigint> {
	const { topic, partition } = state.position;
	try {
		const { lookupTimeoutMs } = ctx.replayWindow;
		const offset = await withTimeout({
			read: readWindowStartOffsetWithRetries({
				ctx,
				topic,
				partition,
				deadline: performance.now() + lookupTimeoutMs,
			}),
			timeoutMs: lookupTimeoutMs,
		});
		if (offset === null) return bookmark;
		const logStartOffset = state.lastLogRange?.logStartOffset ?? offset;
		const floor = offset < logStartOffset ? logStartOffset : offset;
		return floor < bookmark ? floor : bookmark;
	} catch (cause) {
		ctx.logger?.warn("Replay window lookup skipped; starting at the bookmark", {
			topic,
			partition,
			error: cause,
		});
		return bookmark;
	}
}

const LOOKUP_RETRY_DELAY_MS = 100;

/** A failed lookup is read again until the budget runs out: a leader that moved mid-roll answers a later try,
 *  and starting at the bookmark instead forgets every command id the window held. */
async function readWindowStartOffsetWithRetries({
	ctx,
	topic,
	partition,
	deadline,
}: {
	ctx: PartitionReplayContext;
	topic: string;
	partition: number;
	deadline: number;
}): Promise<bigint | null> {
	for (;;) {
		try {
			return await readWindowStartOffset({ ctx, topic, partition });
		} catch (cause) {
			if (performance.now() + LOOKUP_RETRY_DELAY_MS >= deadline) throw cause;
			await new Promise((resolve) =>
				setTimeout(resolve, LOOKUP_RETRY_DELAY_MS),
			);
		}
	}
}

/** Null when the broker cannot answer (an admin without the call, or nothing that recent on the partition). */
async function readWindowStartOffset({
	ctx,
	topic,
	partition,
}: {
	ctx: PartitionReplayContext;
	topic: string;
	partition: number;
}): Promise<bigint | null> {
	const { fetchTopicOffsetsByTimestamp } = ctx.partitionOffsets;
	if (!fetchTopicOffsetsByTimestamp) return null;
	return readPartitionOffsetAtTimestamp({
		ctx: {
			partitionOffsets: {
				fetchTopicOffsetsByTimestamp: fetchTopicOffsetsByTimestamp.bind(
					ctx.partitionOffsets,
				),
			},
		},
		topic,
		partition,
		timestamp: ctx.replayWindow.now() - ctx.replayWindow.windowMs,
	});
}

async function withTimeout<T>({
	read,
	timeoutMs,
}: {
	read: Promise<T>;
	timeoutMs: number;
}): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const expiry = new Promise<never>((_, reject) => {
		timer = setTimeout(
			() => reject(new Error(`Timed out after ${timeoutMs}ms`)),
			timeoutMs,
		);
	});
	try {
		return await Promise.race([read, expiry]);
	} finally {
		clearTimeout(timer);
	}
}
