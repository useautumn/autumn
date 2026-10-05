/**
 * An HTTP worker's replies waiting on their partition's commit position, released in sequence order once the
 * shared cell reaches them. Nothing is released on a partition while a published failure has not arrived yet.
 */
import type { FailFrame } from "../frames/failFrame.js";

type Held = { seq: number; answer(): void };
type FailedAnswer = (params: { status: number; body: Uint8Array }) => void;

export type HeldReplies = {
	hold(params: {
		partition: number;
		seq: number;
		answer(): void;
		fail: FailedAnswer;
	}): void;
	/** Answers every reply whose position has been reached; true if any are still held. */
	release(): boolean;
	fail(fail: FailFrame): void;
	/** Whether some held reply could go out now: the signal's sleep re-checks it. */
	releasable(): boolean;
};

export function createHeldReplies({
	commitCells,
	failureCounts,
}: {
	commitCells: SharedArrayBuffer;
	failureCounts: SharedArrayBuffer;
}): HeldReplies {
	const positions = new BigInt64Array(commitCells);
	const failures = new Int32Array(failureCounts);
	// Failures published before this thread started concern nothing it holds.
	const failuresSeen = Int32Array.from(failures, (_, partition) =>
		Atomics.load(failures, partition),
	);
	const held = new Map<number, (Held & { fail: FailedAnswer })[]>();

	function hold({
		partition,
		seq,
		answer,
		fail,
	}: {
		partition: number;
		seq: number;
		answer(): void;
		fail: FailedAnswer;
	}): void {
		const queue = held.get(partition) ?? [];
		held.set(partition, queue);
		let at = queue.length;
		while (at > 0 && (queue[at - 1] as Held).seq > seq) at--;
		queue.splice(at, 0, { seq, answer, fail });
	}

	function positionOf({ partition }: { partition: number }): number | null {
		if (Atomics.load(failures, partition) !== failuresSeen[partition])
			return null;
		return Number(Atomics.load(positions, partition));
	}

	function release(): boolean {
		for (const [partition, queue] of held) {
			const position = positionOf({ partition });
			if (position === null) continue;
			let released = 0;
			while (
				released < queue.length &&
				(queue[released] as Held).seq <= position
			)
				(queue[released++] as Held).answer();
			if (released === queue.length) held.delete(partition);
			else if (released > 0) queue.splice(0, released);
		}
		return held.size > 0;
	}

	function fail({
		partition,
		aboveSeq,
		lastSeq,
		status,
		body,
	}: FailFrame): void {
		failuresSeen[partition] = (failuresSeen[partition] as number) + 1;
		const queue = held.get(partition);
		if (!queue) return;
		const kept = queue.filter((reply) => {
			if (reply.seq <= aboveSeq || reply.seq > lastSeq) return true;
			reply.fail({ status, body });
			return false;
		});
		if (kept.length > 0) held.set(partition, kept);
		else held.delete(partition);
	}

	function releasable(): boolean {
		for (const [partition, queue] of held) {
			const position = positionOf({ partition });
			if (position !== null && (queue[0] as Held).seq <= position) return true;
		}
		return false;
	}

	return { hold, release, fail, releasable };
}
