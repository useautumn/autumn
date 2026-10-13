import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

/** Per server process; with ~15 processes shadowing, each replica behind the ALB is read about every 10 s. */
const SAMPLE_EVERY_MS = 5_000;
const HEALTH_TIMEOUT_MS = 2_000;

let lastSampledAt = Number.NEGATIVE_INFINITY;

export const _resetShadowAtomHealthSamplingForTesting = () => {
	lastSampledAt = Number.NEGATIVE_INFINITY;
};

/**
 * Logs one of the shadow Atom's /health answers (per-thread counters, loop lag, container CPU) while shadow traffic
 * flows. The Atom's own log export drops a surge, so this server-side copy is what a load test reads its threads from.
 */
export const sampleShadowAtomHealth = ({
	ctx,
	endpointUrl,
}: {
	ctx: AutumnContext;
	endpointUrl: string;
}): void => {
	const now = performance.now();
	if (now - lastSampledAt < SAMPLE_EVERY_MS) return;
	lastSampledAt = now;
	void readHealth({ endpointUrl })
		.then((health) =>
			ctx.logger.info("atom_shadow_health", {
				type: "atom_shadow_health",
				...health,
			}),
		)
		.catch(() => {});
};

const readHealth = async ({ endpointUrl }: { endpointUrl: string }) => {
	const startedAt = performance.now();
	const response = await fetch(new URL("/health", endpointUrl), {
		signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
	});
	return {
		status_code: response.status,
		latency_ms: Math.round(performance.now() - startedAt),
		health: await response.json(),
	};
};
