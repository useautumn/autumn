import type { MeteringRecord } from "@autumn/kafka";

/** An appender whose batches a test releases by hand, recording what it was given. */
export function gatedAppender() {
	const batches: {
		outcomes: readonly MeteringRecord[];
		release: (outcome?: unknown) => void;
	}[] = [];
	let appended = 0n;
	let held = true;
	return {
		batches,
		hold() {
			held = true;
		},
		open() {
			held = false;
			for (const batch of batches.splice(0)) batch.release();
		},
		releaseNext(outcome?: unknown) {
			batches.shift()?.release(outcome);
		},
		appender: {
			appendCommitted: ({
				outcomes,
			}: {
				outcomes: readonly MeteringRecord[];
			}) =>
				new Promise<{ baseOffset: bigint }>((resolve, reject) => {
					function release(outcome?: unknown): void {
						if (outcome instanceof Error) {
							reject(outcome);
							return;
						}
						const baseOffset = appended;
						appended += BigInt(outcomes.length);
						resolve({ baseOffset });
					}
					if (!held) {
						release();
						return;
					}
					batches.push({ outcomes, release });
				}),
		},
	};
}
