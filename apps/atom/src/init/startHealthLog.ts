import { type AtomHealthSource, readAtomHealth } from "./atomHealth.js";
import {
	bootTotals,
	healthIntervalBetween,
	healthTotalsOf,
} from "./healthInterval.js";

type HealthLogger = {
	info(fields: object, message: string): void;
	warn(fields: object, message: string): void;
};

/**
 * Logs what /health reports, and what changed since the line before, from the main thread, every `everyMs`.
 * Nothing here may take the Atom down: a tick that fails is a warning, and a warning that fails is dropped.
 */
export const startHealthLog = ({
	source,
	everyMs,
	logger,
}: {
	source: AtomHealthSource;
	everyMs: number;
	logger: HealthLogger;
}): { log(): void; stop(): void } => {
	let previous = bootTotals({ bootedAt: source.bootedAt });

	function log(): void {
		try {
			const health = readAtomHealth(source);
			const current = healthTotalsOf({ health, at: Date.now() });
			const interval = healthIntervalBetween({ previous, current });
			logger.info(
				{ type: "atom_health", data: { ...health, interval } },
				"atom health",
			);
			previous = current;
		} catch (error) {
			try {
				logger.warn(
					{ type: "atom_health_log_failed", error },
					"Could not log the Atom's health",
				);
			} catch {
				// Nowhere left to report it; the next tick tries again.
			}
		}
	}

	const timer = setInterval(log, everyMs);
	timer.unref?.();

	return { log, stop: () => clearInterval(timer) };
};
