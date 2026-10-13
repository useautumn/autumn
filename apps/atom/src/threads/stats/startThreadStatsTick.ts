import { nativeReadStats } from "../../processor/createNativeReadProcessor.js";
import type { HeldSubjects } from "../../state/heldSubjects/types/heldSubjects.js";
import { getNativeReadCache } from "../../state/nativeSubjects/nativeReadCache.js";
import { getNativeSubjects } from "../../state/nativeSubjects/nativeSubjects.js";
import type { ThreadCounters } from "./threadStats.js";

const TICK_MS = 1000;
/** A tick this late means the loop was busy with one thing for that long: a stall worth counting. */
const STALL_MS = 100;

/** Once a second, the thread drops what sat idle, publishes what it holds and how late its event loop ran the tick. */
export const startThreadStatsTick = ({
	counters,
	held,
}: {
	counters: ThreadCounters;
	held: HeldSubjects;
}): { stop(): void } => {
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
		const readCache = getNativeReadCache();
		if (!readCache) return;
		counters.set("nativeAnswered", nativeReadStats.answered);
		counters.set("nativeHops", nativeReadStats.hops);
		counters.set("nativeParses", readCache.stats.parses);
		counters.set("nativeCacheBytes", readCache.bytes);
		counters.set("nativeStoreBytes", getNativeSubjects()?.bytes ?? 0);
	}, TICK_MS);
	timer.unref();
	return { stop: () => clearInterval(timer) };
};
