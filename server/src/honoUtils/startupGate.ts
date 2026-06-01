// After this long without Redis becoming ready, latch the gate anyway and fall
// back to the runtime fail-open path. Bounds the worst case to a brief startup
// delay instead of an indefinite crash-loop — e.g. when the active V2 instance
// has been failed over to an alternate while the Dragonfly client the gate
// watches never connects. Kept well under the ECS health-check grace period so
// the timeout latch always beats ECS's task-kill timer.
export const STARTUP_GATE_MAX_WAIT_MS = 20_000;

/** Pure decision for the startup gate. `redisReady`/`redisV2Ready` already fold
 *  in "not configured" as ready. Once `elapsedMs` reaches the max wait we serve
 *  regardless, leaving degradation to the runtime fail-open path.
 *
 *  Kept side-effect-free (no Redis/logger imports) so it is unit-testable
 *  without triggering the stateful latch in handleHealthCheck. */
export const evaluateStartupGate = ({
	redisReady,
	redisV2Ready,
	elapsedMs,
	maxWaitMs = STARTUP_GATE_MAX_WAIT_MS,
}: {
	redisReady: boolean;
	redisV2Ready: boolean;
	elapsedMs: number;
	maxWaitMs?: number;
}): { ready: boolean; reason: string | null } => {
	if (redisReady && redisV2Ready) {
		return { ready: true, reason: "Redis ready" };
	}
	if (elapsedMs >= maxWaitMs) {
		return {
			ready: true,
			reason: "max wait elapsed; serving via runtime fail-open",
		};
	}
	return { ready: false, reason: null };
};
