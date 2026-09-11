export const TEST_COUNT = 24;
export const DISPATCH_MS = 450;
export const RESULT_MS = 300;
export const WORKER_READY_MS = [2200, 2500, 2800];

export type TestAttempt = {
	id: number;
	worker: number;
	slot: number;
	start: number;
	end: number;
	retry: boolean;
	fails: boolean;
};

function buildAttempts(): TestAttempt[] {
	const available = Array.from({ length: 9 }, (_, i) =>
		Math.max(3000, WORKER_READY_MS[Math.floor(i / 3)]),
	);
	const attempts: TestAttempt[] = [];
	for (let id = 0; id < TEST_COUNT; id++) {
		const lane = available.indexOf(Math.min(...available));
		const start = available[lane];
		const end = start + DISPATCH_MS + 1450 + ((id * 317) % 1100);
		attempts.push({
			id,
			worker: Math.floor(lane / 3),
			slot: lane % 3,
			start,
			end,
			retry: false,
			fails: id === 5,
		});
		available[lane] = end + 160;
	}
	const failed = attempts.find((attempt) => attempt.fails);
	if (!failed) throw new Error("Missing illustrative failure");
	// Retry on another worker after its current assignments have drained.
	const retryLane = available.reduce((best, time, lane) => {
		if (Math.floor(lane / 3) === failed.worker) return best;
		if (best === -1 || time < available[best]) return lane;
		return best;
	}, -1);
	const start = Math.max(failed.end + 650, available[retryLane]);
	attempts.push({
		id: failed.id,
		worker: Math.floor(retryLane / 3),
		slot: retryLane % 3,
		start,
		end: start + DISPATCH_MS + 1500,
		retry: true,
		fails: false,
	});
	return attempts;
}

export const ATTEMPTS = buildAttempts();
function requiredAttempt(retry: boolean) {
	const attempt = ATTEMPTS.find((item) => (retry ? item.retry : item.fails));
	if (!attempt) throw new Error("Missing retry scenario");
	return attempt;
}
export const RETRY = requiredAttempt(true);
export const FAILED = requiredAttempt(false);
export const END_MS =
	Math.max(...ATTEMPTS.map((attempt) => attempt.end)) + RESULT_MS + 600;

export function getPoolState(time: number) {
	const passed = ATTEMPTS.filter(
		(attempt) => !attempt.fails && time >= attempt.end + RESULT_MS,
	);
	const queued = ATTEMPTS.filter(
		(attempt) => !attempt.retry && time < attempt.start,
	);
	const retrying = time >= FAILED.end && time < RETRY.end + RESULT_MS;
	let status = "Preparing snapshot";
	if (time >= 2000) status = "Starting workers";
	if (time >= 3000) status = "Running tests";
	if (time >= END_MS) status = "Complete";
	return { passed, queued, retrying, status };
}

export const POOL_LAYOUT = {
	width: 900,
	height: 438,
	workerX: [222, 382, 542],
	workerY: 192,
	slotY: 239,
};

export function slotPosition(attempt: TestAttempt) {
	return {
		x: POOL_LAYOUT.workerX[attempt.worker] + 17 + attempt.slot * 40,
		y: POOL_LAYOUT.slotY,
	};
}

export function progress(time: number, start: number, duration: number) {
	return Math.max(0, Math.min(1, (time - start) / duration));
}
