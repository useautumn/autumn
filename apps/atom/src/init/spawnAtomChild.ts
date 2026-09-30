import type { AtomChild } from "./types/atomSupervisor.js";

/** Set on a process the supervisor started, so it serves instead of supervising. */
export const ATOM_CHILD_INDEX = "ATOM_CHILD_INDEX";

/** The same program again, as one of the supervisor's processes. Its output goes where the supervisor's does. */
export const spawnAtomChild = ({ index }: { index: number }): AtomChild => {
	const child = Bun.spawn(
		[process.execPath, ...process.execArgv, ...process.argv.slice(1)],
		{
			env: { ...process.env, [ATOM_CHILD_INDEX]: String(index) },
			stdin: "ignore",
			stdout: "inherit",
			stderr: "inherit",
		},
	);
	return { exited: child.exited, kill: (signal) => child.kill(signal) };
};
