// After this long without Redis becoming ready, latch the gate anyway and fall
// back to the runtime fail-open path. Bounds the worst case to a brief startup
// delay instead of an indefinite crash-loop — e.g. when the active V2 instance
// has been failed over to an alternate while the Dragonfly client the gate
// watches never connects. Kept well under the ECS health-check grace period so
// the timeout latch always beats ECS's task-kill timer.
export const STARTUP_GATE_MAX_WAIT_MS = 20_000;
export const STARTUP_ROUTING_MAX_WAIT_MS = 5_000;

/** Pure decision for the startup gate. `redisReady`/`redisV2Ready` already fold
 *  in "not configured" as ready. Once `elapsedMs` reaches the max wait we serve
 *  regardless, leaving degradation to the runtime fail-open path.
 *
 *  Kept side-effect-free (no Redis/logger imports) so it is unit-testable
 *  without triggering the stateful latch in handleHealthCheck. */
export const evaluateStartupGate = ({
	redisReady,
	redisV2Ready,
	routingReady,
	elapsedMs,
	maxWaitMs = STARTUP_GATE_MAX_WAIT_MS,
}: {
	redisReady: boolean;
	redisV2Ready: boolean;
	routingReady: boolean;
	elapsedMs: number;
	maxWaitMs?: number;
}): { ready: boolean; reason: string } => {
	const redisAllReady = redisReady && redisV2Ready;
	if (redisAllReady && routingReady) {
		return { ready: true, reason: "Redis ready, worker routing ready" };
	}
	if (redisAllReady && elapsedMs >= STARTUP_ROUTING_MAX_WAIT_MS) {
		return {
			ready: true,
			reason:
				"Redis ready; worker routing still catching up, serving via runtime fail-open",
		};
	}
	if (elapsedMs >= maxWaitMs) {
		return {
			ready: true,
			reason: "max wait elapsed; serving via runtime fail-open",
		};
	}
	return {
		ready: false,
		reason: redisAllReady ? "Worker routing not ready" : "Redis not ready",
	};
};
