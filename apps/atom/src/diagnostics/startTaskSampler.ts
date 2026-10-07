import { readdirSync, readFileSync } from "node:fs";
import type { AutumnLogger } from "@autumn/logging";
import { alignedWindows } from "./alignedWindows.js";
import { profileWindowSeconds } from "./startSelfProfile.js";

const EVERY_MS = 20;
const TOP_SYSCALLS = 4;

type TaskTally = {
	name: string;
	n: number;
	running: number;
	states: Record<string, number>;
	syscalls: Record<string, number>;
};

const readOrNull = (path: string): string | null => {
	try {
		return readFileSync(path, "utf8");
	} catch {
		return null;
	}
};

/** One look at every thread: its state, and the syscall it is blocked in (arm64 numbers; "running" when on CPU). */
const sampleTasks = (tally: Map<number, TaskTally>) => {
	for (const entry of readdirSync("/proc/self/task")) {
		const tid = Number(entry);
		const stat = readOrNull(`/proc/self/task/${entry}/stat`);
		if (!stat) continue;
		const name = stat.slice(stat.indexOf("(") + 1, stat.lastIndexOf(")"));
		const state = stat.slice(
			stat.lastIndexOf(")") + 2,
			stat.lastIndexOf(")") + 3,
		);
		const syscall =
			readOrNull(`/proc/self/task/${entry}/syscall`)?.split(" ")[0]?.trim() ??
			"?";
		const row = tally.get(tid) ?? {
			name,
			n: 0,
			running: 0,
			states: {},
			syscalls: {},
		};
		row.n += 1;
		if (state === "R") row.running += 1;
		row.states[state] = (row.states[state] ?? 0) + 1;
		if (state !== "R") row.syscalls[syscall] = (row.syscalls[syscall] ?? 0) + 1;
		tally.set(tid, row);
	}
};

/** Measure-only, main thread: samples every thread's state and blocking syscall at 50 Hz in the profile windows. */
export const startTaskSampler = ({
	everySeconds,
	logger,
}: {
	everySeconds: number;
	logger: Pick<AutumnLogger, "info">;
}): { stop(): void } =>
	alignedWindows({
		everySeconds,
		run: async () => {
			const tally = new Map<number, TaskTally>();
			const startedAt = new Date().toISOString();
			const timer = setInterval(() => sampleTasks(tally), EVERY_MS);
			await Bun.sleep(profileWindowSeconds(everySeconds) * 1000);
			clearInterval(timer);
			const tasks = [...tally.entries()].map(([tid, row]) => ({
				tid,
				name: row.name,
				n: row.n,
				runPct: Math.round((row.running / row.n) * 1000) / 10,
				states: row.states,
				syscalls: Object.fromEntries(
					Object.entries(row.syscalls)
						.sort((a, b) => b[1] - a[1])
						.slice(0, TOP_SYSCALLS),
				),
			}));
			logger.info(
				{ type: "atom_task_sample" },
				`Atom task sample ${JSON.stringify({ startedAt, tasks })}`,
			);
		},
	});
