import type { HeldSubjects } from "../../state/heldSubjects/types/heldSubjects.js";
import type { ThreadCounters } from "./threadStats.js";

const TICK_MS = 1000;
const STALL_MS = 100;

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
	}, TICK_MS);
	timer.unref();
	return { stop: () => clearInterval(timer) };
};
