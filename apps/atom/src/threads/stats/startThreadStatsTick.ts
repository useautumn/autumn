import { heapSize } from "bun:jsc";
import { readViewFoldThreadStats } from "../../processor/actions/readCurrentSubject/readCurrentSubject.js";
import type { HeldSubjects } from "../../state/heldSubjects/types/heldSubjects.js";
import { readJournalThreadStats } from "../../state/journal/openJournal.js";
import { readSqliteWriterThreadStats } from "../../state/writer/getSqliteWriter.js";
import { readStageClock } from "./stageClock.js";
import type { ThreadCounters, ThreadStatField } from "./threadStats.js";

const TICK_MS = 1000;
/** A tick this late means the loop was busy with one thing for that long: a stall worth counting. */
const STALL_MS = 100;

/** Once a second, the thread drops what sat idle, publishes what it holds, what its journals owe Autumn, and how late its event loop ran the tick. */
export const startThreadStatsTick = ({
	counters,
	held,
}: {
	counters: ThreadCounters;
	held: HeldSubjects;
}): { stop(): void } => {
	const startedAt = performance.now();
	let dueAt = performance.now() + TICK_MS;
	const timer = setInterval(() => {
		const lagMs = Math.max(0, performance.now() - dueAt);
		dueAt = performance.now() + TICK_MS;
		counters.set("loopLagMs", Math.round(lagMs));
		if (lagMs >= STALL_MS) counters.add("loopStalls");
		held.expireIdle();
		counters.set("heldSubjects", held.size);
		counters.set("heldBytes", held.bytes);
		counters.set("heldLookups", held.lookups);
		counters.set("heldMisses", held.misses);
		counters.set("heldEvicted", held.evicted);
		counters.set("heldExpired", held.expired);
		const journals = readJournalThreadStats({ now: Date.now() });
		counters.set("journalUnsent", journals.journalUnsent);
		counters.set("journalOldestUnsentMs", journals.journalOldestUnsentMs);
		counters.set("tracksAppended", journals.tracksAppended);
		counters.set("appendFailed", journals.appendFailed);
		counters.set("heapBytes", heapSize());
		const stages = readStageClock({
			aliveUs: (performance.now() - startedAt) * 1000,
		});
		for (const [field, value] of Object.entries({
			...readViewFoldThreadStats(),
			...readSqliteWriterThreadStats(),
			...stages,
		}))
			counters.set(field as ThreadStatField, value);
	}, TICK_MS);
	timer.unref();
	return { stop: () => clearInterval(timer) };
};
