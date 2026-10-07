import type { AutumnLogger } from "@autumn/logging";
import { alignedWindows } from "./alignedWindows.js";
import { profileThread } from "./profileThread.js";

/** 1 kHz: enough samples in a 10 s window, at a fraction of the default 2 kHz's overhead. */
const SAMPLE_INTERVAL_MICROS = 1000;

export const profileWindowSeconds = (everySeconds: number): number =>
	Math.max(1, Math.min(10, Math.floor(everySeconds / 2)));

/** Measure-only: each thread profiles itself on a shared wall-clock period and logs the result on the message line. */
export const startSelfProfile = ({
	everySeconds,
	label,
	logger,
}: {
	everySeconds: number;
	label: string;
	logger: Pick<AutumnLogger, "info" | "warn">;
}): { stop(): void } =>
	alignedWindows({
		everySeconds,
		run: async () => {
			const profile = await profileThread({
				seconds: profileWindowSeconds(everySeconds),
				intervalMicros: SAMPLE_INTERVAL_MICROS,
			});
			logger.info(
				{ type: "atom_thread_profile" },
				`Atom thread ${label} profile ${JSON.stringify({ label, ...profile })}`,
			);
		},
	});
