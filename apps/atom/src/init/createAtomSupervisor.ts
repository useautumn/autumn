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

	/** Keeps trying at the restart pace until the place is filled, stopped, or filled by someone else. */
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
		while (!stopping && children.get(index) === child) {
			await Bun.sleep(config.restartDelayMs);
			if (stopping || children.get(index) !== child) return;
			try {
				startChild({ index });
			} catch (error) {
				ctx.logger.error(
					{ type: "atom_process_spawn_failed", error, data: { index } },
					"An Atom process could not be started; trying again",
				);
			}
		}
	}

	/** A process that cannot start takes the others down: a half-started Atom is not left serving unsupervised. */
	async function start(): Promise<void> {
		try {
			for (let index = 0; index < config.processes; index++)
				startChild({ index });
		} catch (error) {
			await stop();
			throw error;
		}
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
