import { lt } from "drizzle-orm";
import { runLogs } from "../db/schema/runs.ts";
import { startAllocator } from "../internal/accounts/allocator/accountAllocator.ts";
import { scheduleBaselineRuns } from "../internal/results/actions/scheduleBaselineRuns.ts";
import { createContext, SYSTEM_ACTOR } from "./createContext.ts";

const BASELINE_CHECK_MS = 60 * 60_000;
const LOG_RETENTION_DAYS = 14;

const runSafely = (name: string, fn: () => Promise<unknown>) => () =>
	void fn().catch((error: unknown) =>
		createContext().logger.warn(`${name} failed`, { error: String(error) }),
	);

/** Periodic housekeeping (FIFO account allocator, baseline scheduling); returns a stop function. */
export const startSweepers = (): (() => void) => {
	const ctx = createContext({ actor: SYSTEM_ACTOR });
	const stopAllocator = startAllocator();
	const timers = [
		setInterval(
			runSafely("baseline schedule", () => scheduleBaselineRuns({ ctx })),
			BASELINE_CHECK_MS,
		),
		setInterval(
			runSafely("log retention", () =>
				ctx.db
					.delete(runLogs)
					.where(
						lt(
							runLogs.createdAt,
							new Date(Date.now() - LOG_RETENTION_DAYS * 86_400_000),
						),
					),
			),
			BASELINE_CHECK_MS,
		),
	];
	return () => {
		stopAllocator();
		for (const timer of timers) clearInterval(timer);
	};
};
