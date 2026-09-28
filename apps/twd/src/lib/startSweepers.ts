import { sweepExpiredReservations } from "../internal/accounts/actions/reservations.ts";
import { scheduleBaselineRuns } from "../internal/results/actions/scheduleBaselineRuns.ts";
import { createContext, SYSTEM_ACTOR } from "./createContext.ts";

const RESERVATION_SWEEP_MS = 60_000;
const BASELINE_CHECK_MS = 60 * 60_000;

const runSafely = (name: string, fn: () => Promise<unknown>) => () =>
	void fn().catch((error: unknown) =>
		createContext().logger.warn(`${name} failed`, { error: String(error) }),
	);

/** Periodic housekeeping; returns a stop function. */
export const startSweepers = (): (() => void) => {
	const ctx = createContext({ actor: SYSTEM_ACTOR });
	const timers = [
		setInterval(
			runSafely("reservation sweep", () => sweepExpiredReservations({ ctx })),
			RESERVATION_SWEEP_MS,
		),
		setInterval(
			runSafely("baseline schedule", () => scheduleBaselineRuns({ ctx })),
			BASELINE_CHECK_MS,
		),
	];
	return () => {
		for (const timer of timers) clearInterval(timer);
	};
};
