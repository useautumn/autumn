import {
	type MeteringIdentity,
	meteringIdentityToSubjectKey,
	type SubjectState,
} from "@autumn/balance-engine";
import { createSubjectLoadGate } from "../../../external/postgres/createSubjectLoadGate.js";
import { SubjectLoadBusyError } from "../subjectErrors.js";
import type { SubjectScope } from "../types/subject.js";
import { fallbackToFullRead } from "./actions/fallbackToFullRead.js";
import { logSnapshotBatch } from "./actions/logSnapshotBatch.js";
import { readSnapshotBatch } from "./actions/readSnapshotBatch.js";
import { settleSnapshotHits } from "./actions/settleSnapshotHits.js";
import { createQuarantine } from "./quarantine/createQuarantine.js";
import {
	SNAPSHOT_BACKOFF_MS,
	SNAPSHOT_BATCH_SIZE,
	SNAPSHOT_FALLBACKS_IN_FLIGHT,
	SNAPSHOT_QUEUE_CAP,
} from "./snapshotLoaderLimits.js";
import type {
	SnapshotLoader,
	SnapshotWaiting,
} from "./types/snapshotLoader.js";

/**
 * One per partition. Cold loads collect into one SELECT at a time; a hit answers from the row, a miss goes to the
 * full query a few at a time. Nothing a check does waits on this: the writer answers warm subjects before it is asked.
 */
export const createSnapshotLoader = ({
	scopeOf,
	sleep = (ms) => Bun.sleep(ms),
}: {
	scopeOf: () => SubjectScope;
	sleep?: (ms: number) => Promise<void>;
}): SnapshotLoader => {
	const waiting = new Map<string, SnapshotWaiting>();
	let selecting = false;
	let backoffMs = SNAPSHOT_BACKOFF_MS.initial;
	const fallbacks = createSubjectLoadGate({
		config: { limit: SNAPSHOT_FALLBACKS_IN_FLIGHT },
	});
	const quarantine = createQuarantine();

	function load({
		identity,
		asOf,
	}: {
		identity: MeteringIdentity;
		asOf: number;
	}) {
		const subjectKey = meteringIdentityToSubjectKey({ identity });
		const joined = waiting.get(subjectKey);
		if (joined) return joined.settle.promise;
		if (waiting.size >= SNAPSHOT_QUEUE_CAP)
			return Promise.reject(new SubjectLoadBusyError({ identity }));
		const entry: SnapshotWaiting = {
			identity,
			subjectKey,
			asOf,
			settle: Promise.withResolvers<SubjectState>(),
		};
		waiting.set(subjectKey, entry);
		// Arrivals in this turn of the loop share the SELECT; arrivals during it form the next.
		if (!selecting) {
			selecting = true;
			setImmediate(() => void selectUntilEmpty());
		}
		return entry.settle.promise;
	}

	async function selectUntilEmpty(): Promise<void> {
		try {
			while (waiting.size > 0) await selectOnce();
		} finally {
			selecting = false;
		}
	}

	async function selectOnce(): Promise<void> {
		const scope = scopeOf();
		const batch = [...waiting.values()].slice(0, SNAPSHOT_BATCH_SIZE);
		const startedAt = performance.now();
		const read = await readSnapshotBatch({
			scope,
			identities: batch.map((entry) => entry.identity),
		});
		if (!read.ok && read.transient) {
			// Nobody is answered: the batch waits out the backoff and is asked again whole; callers leave at their deadline.
			await sleep(backoffMs);
			backoffMs = Math.min(backoffMs * 2, SNAPSHOT_BACKOFF_MS.max);
			return;
		}
		backoffMs = SNAPSHOT_BACKOFF_MS.initial;
		for (const entry of batch) waiting.delete(entry.subjectKey);
		const selectMs = performance.now() - startedAt;
		const { misses, counts } = settleSnapshotHits({
			scope,
			batch,
			rowsBySubject: read.ok ? read.rowsBySubject : new Map(),
		});
		// The next SELECT does not wait for these: the gate keeps them to a few, the line lands once they settle.
		const fallbackStartedAt = performance.now();
		void Promise.all(
			misses.map((entry) => settleFromFullRead({ scope, entry })),
		).then(() =>
			logSnapshotBatch({
				scope,
				size: batch.length,
				counts,
				selectMs,
				fallbackMs: performance.now() - fallbackStartedAt,
				queueDepth: waiting.size,
				...(read.ok ? {} : { refused: read.cause }),
			}),
		);
	}

	async function settleFromFullRead({
		scope,
		entry,
	}: {
		scope: SubjectScope;
		entry: SnapshotWaiting;
	}): Promise<void> {
		try {
			entry.settle.resolve(
				await fallbacks.run(() =>
					fallbackToFullRead({ scope, waiting: entry, quarantine }),
				),
			);
		} catch (cause) {
			entry.settle.reject(cause);
		}
	}

	return { load, queueDepth: () => waiting.size };
};
