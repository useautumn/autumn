export const STARTUP_GATE_MAX_WAIT_MS = 20_000;
export const STARTUP_ROUTING_MAX_WAIT_MS = 5_000;

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
