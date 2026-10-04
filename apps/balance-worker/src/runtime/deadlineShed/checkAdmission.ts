/** How often the loop is probed for lateness, and how much lateness counts as the task falling behind. */
const PROBE_INTERVAL_MS = 10;
const BEHIND_LAG_MS = 50;
/** Lateness is smoothed over a few probes, so one slow turn does not shed anyone. */
const LAG_SMOOTHING = 0.3;
/** Shares are counted over this window, and a customer may hold this much of it while the task is behind. */
const WINDOW_MS = 250;
const MAX_SHARE = 0.5;
/** Below this many checks in a window a customer is never shed, whatever its share. */
const MIN_PER_WINDOW = 25;

type Window = {
	startedAt: number;
	total: number;
	byCustomer: Map<string, number>;
};

export type CheckAdmission = {
	/** Counts the check, and whether it may run: false only while the task is behind and the customer is over its share. */
	admit(params: { customerKey: string }): boolean;
	readCounters(): {
		admitted: number;
		shed: number;
		behind: boolean;
		lagMs: number;
	};
	stop(): void;
};

/**
 * Task-wide, since every partition on the task shares one event loop: a customer holding more than half the
 * task's recent checks is shed while the loop runs late, and admitted as usual once it catches up.
 */
export function createCheckAdmission({
	now = readClock,
	schedule = scheduleProbe,
}: {
	now?: () => number;
	schedule?: (params: { intervalMs: number; run(): void }) => () => void;
} = {}): CheckAdmission {
	let lagMs = 0;
	let lastProbeAt = now();
	let current: Window = {
		startedAt: lastProbeAt,
		total: 0,
		byCustomer: new Map(),
	};
	let previous: Window | null = null;
	let admitted = 0;
	let shed = 0;

	function probe(): void {
		const at = now();
		const late = Math.max(0, at - lastProbeAt - PROBE_INTERVAL_MS);
		lastProbeAt = at;
		lagMs = lagMs * (1 - LAG_SMOOTHING) + late * LAG_SMOOTHING;
	}
	const cancel = schedule({ intervalMs: PROBE_INTERVAL_MS, run: probe });

	function rollWindow(at: number): void {
		if (at - current.startedAt < WINDOW_MS) return;
		previous = current;
		current = { startedAt: at, total: 0, byCustomer: new Map() };
	}

	function isBehind(at: number): boolean {
		// A probe that has not fired for a while is itself the loop running late.
		const pending = Math.max(0, at - lastProbeAt - PROBE_INTERVAL_MS);
		return Math.max(lagMs, pending) >= BEHIND_LAG_MS;
	}

	function admit({ customerKey }: { customerKey: string }): boolean {
		const at = now();
		rollWindow(at);
		const count = (current.byCustomer.get(customerKey) ?? 0) + 1;
		current.byCustomer.set(customerKey, count);
		current.total += 1;
		const total = current.total + (previous?.total ?? 0);
		const mine = count + (previous?.byCustomer.get(customerKey) ?? 0);
		const overShare = mine > MIN_PER_WINDOW && mine > total * MAX_SHARE;
		if (overShare && isBehind(at)) {
			shed += 1;
			return false;
		}
		admitted += 1;
		return true;
	}

	function readCounters() {
		return { admitted, shed, behind: isBehind(now()), lagMs };
	}

	return { admit, readCounters, stop: cancel };
}

function scheduleProbe({
	intervalMs,
	run,
}: {
	intervalMs: number;
	run(): void;
}): () => void {
	const timer = setInterval(run, intervalMs);
	timer.unref();
	function cancel(): void {
		clearInterval(timer);
	}
	return cancel;
}

function readClock(): number {
	return performance.now();
}

let checkAdmission: CheckAdmission | undefined;

/** One per task, started the first time arm B asks; arm A never starts its probe. */
export function getCheckAdmission(): CheckAdmission {
	checkAdmission ??= createCheckAdmission();
	return checkAdmission;
}
