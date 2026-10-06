import type { AutumnLogger } from "@autumn/logging";
import { profileProcess } from "./profileProcess.js";

/** At most this long per profile, and never more than half the period, so sampling stays a small share of the thread. */
const MAX_WINDOW_SECONDS = 10;
/** Functions kept per list: container log lines split past 16 KB, and a split line can't be read back whole. */
const TOP_LOGGED = 15;
/** 1 kHz: enough samples in a 10 s window for the top functions, at a fraction of the default 2 kHz's overhead. */
const SAMPLE_INTERVAL_MICROS = 1000;

/**
 * Profiles this thread for a bounded window every `everySeconds`, starting on the same wall-clock boundary on every
 * thread, and logs its top functions. The `/health/profile` sampler, run from inside so no token or listener is needed.
 */
export const startSelfProfile = ({
	everySeconds,
	index,
	logger,
}: {
	everySeconds: number;
	index: number;
	logger: Pick<AutumnLogger, "info" | "warn">;
}): { stop(): void } => {
	const windowSeconds = Math.max(
		1,
		Math.min(MAX_WINDOW_SECONDS, Math.floor(everySeconds / 2)),
	);
	const everyMs = everySeconds * 1000;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let stopped = false;

	async function profileOnce(): Promise<void> {
		try {
			const profile = await profileProcess({
				seconds: windowSeconds,
				intervalMicros: SAMPLE_INTERVAL_MICROS,
			});
			if ("error" in profile) throw new Error(profile.error);
			const { memory: _memory, ...kept } = profile;
			const logged = {
				index,
				...kept,
				selfTop: kept.selfTop.slice(0, TOP_LOGGED),
				selfByCallerTop: kept.selfByCallerTop.slice(0, TOP_LOGGED),
				inclusiveTop: kept.inclusiveTop.slice(0, TOP_LOGGED),
			};
			// In the message itself: a deployed Atom's console lines keep the message and drop `data`.
			logger.info(
				{ type: "atom_thread_profile", data: logged },
				`Atom thread ${index} profile ${JSON.stringify(logged)}`,
			);
		} catch (error) {
			logger.warn(
				{ type: "atom_thread_profile_failed", error, data: { index } },
				`Atom thread ${index} could not profile itself`,
			);
		}
		scheduleNext();
	}

	function scheduleNext(): void {
		if (stopped) return;
		timer = setTimeout(profileOnce, everyMs - (Date.now() % everyMs));
		timer.unref?.();
	}

	scheduleNext();
	return {
		stop: () => {
			stopped = true;
			clearTimeout(timer);
		},
	};
};
