import type { AtomServer } from "./types/atomServer.js";
import type {
	AtomChild,
	AtomSupervisorConfig,
	AtomSupervisorContext,
} from "./types/atomSupervisor.js";

/**
 * Runs the Atom server as several processes that share one port. It serves nothing itself:
 * it starts them, replaces one that dies, and stops them together.
 */
export const createAtomSupervisor = ({
	ctx,
	config,
}: {
	ctx: AtomSupervisorContext;
	config: AtomSupervisorConfig;
}): AtomServer => {
	const children = new Map<number, AtomChild>();
	let stopping = false;

	function startChild({ index }: { index: number }): void {
		const child = ctx.spawnChild({ index });
		children.set(index, child);
		void child.exited.then(() => replaceChild({ index, child }));
	}

	async function replaceChild({
		index,
		child,
	}: {
		index: number;
		child: AtomChild;
	}): Promise<void> {
		if (stopping) return;
		ctx.logger.warn(
			{ type: "atom_process_died", data: { index } },
			"An Atom process died; starting another in its place",
		);
		await Bun.sleep(config.restartDelayMs);
		// Stopped while waiting, or already replaced: nothing to start.
		if (stopping || children.get(index) !== child) return;
		startChild({ index });
	}

	async function start(): Promise<void> {
		for (let index = 0; index < config.processes; index++)
			startChild({ index });
		ctx.logger.info(`Atom running as ${config.processes} processes`);
	}

	/** Each process finishes its in-flight requests and closes its files before it exits. */
	async function stop(): Promise<void> {
		stopping = true;
		const running = [...children.values()];
		for (const child of running) child.kill("SIGTERM");
		await Promise.all(running.map((child) => child.exited));
	}

	return { start, stop };
};
