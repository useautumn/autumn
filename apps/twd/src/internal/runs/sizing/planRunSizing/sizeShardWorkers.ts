import { simulateLptMakespan } from "../../eta/estimateRunEta.ts";
import { RETRY_HEADROOM, SLOT_SAFETY } from "./sizingConstants.ts";

const makespanWith = ({
	durations,
	slots,
}: {
	durations: number[];
	slots: number;
}) =>
	simulateLptMakespan({
		workerFreeAt: Array.from({ length: slots }, () => 0),
		jobs: durations,
		now: 0,
	}) ?? 0;

/** Fewest workers whose longest-first makespan fits targetMs, ×SLOT_SAFETY, plus spare workers for expected retries. */
export const sizeShardWorkers = ({
	durations,
	failRates,
	filesPerWorker,
	targetMs,
	maxWorkers = Number.POSITIVE_INFINITY,
}: {
	durations: number[];
	failRates: number[];
	filesPerWorker: number;
	targetMs: number;
	maxWorkers?: number;
}): { workers: number; makespanMs: number } => {
	if (durations.length === 0) return { workers: 0, makespanMs: 0 };
	let low = 1;
	let high = Math.ceil(durations.length / filesPerWorker);
	while (low < high) {
		const mid = Math.floor((low + high) / 2);
		if (makespanWith({ durations, slots: mid * filesPerWorker }) <= targetMs)
			high = mid;
		else low = mid + 1;
	}
	const retries = Math.ceil(
		RETRY_HEADROOM * failRates.reduce((sum, rate) => sum + rate, 0),
	);
	const workers = Math.min(
		Math.ceil(low * SLOT_SAFETY) + retries,
		durations.length,
		maxWorkers,
	);
	return {
		workers,
		makespanMs: makespanWith({
			durations,
			slots: Math.min(low, workers) * filesPerWorker,
		}),
	};
};
