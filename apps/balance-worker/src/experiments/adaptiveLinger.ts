import { type StagingArm, variant } from "@autumn/edge-config";

/**
 * ATMN-603: under B the writer's commit loop never lingers while the pipe is idle: a batch is whatever
 * gathered during the append before it, and only a batch sent behind one still on the wire waits the
 * configured linger. A keeps today's rule (a short wait whenever the last batch held more than one record).
 * Batch composition, order, the commit mode and the fence are untouched; only the wait before taking a batch.
 */
export const ADAPTIVE_LINGER_EXPERIMENT = "adaptive-linger";

let forced: StagingArm | undefined;

/** Dev, tests and the bench pin the arm; production reads the window's arm every time. */
export function forceAdaptiveLingerArm({
	arm,
}: {
	arm: StagingArm | undefined;
}): void {
	forced = arm;
}

export function adaptiveLingerArm(): StagingArm {
	return forced ?? variant(ADAPTIVE_LINGER_EXPERIMENT);
}

/** True when the pipe is idle under B: nothing on the wire, so nothing is gained by waiting. */
export function skipsIdleLinger({ inFlight }: { inFlight: number }): boolean {
	return inFlight === 0 && adaptiveLingerArm() === "B";
}

/** Dev and test only: `BALANCE_WORKER_ADAPTIVE_LINGER_ARM=B` where no staging bucket exists; never in production. */
export function forcedAdaptiveLingerArmFromEnv(): StagingArm | undefined {
	if (process.env.NODE_ENV === "production") return undefined;
	const value = process.env.BALANCE_WORKER_ADAPTIVE_LINGER_ARM;
	return value === "A" || value === "B" ? value : undefined;
}
