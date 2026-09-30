import { getAtomEnv } from "@autumn/env/atom";
import { createAtomServer } from "./init/createAtomServer.js";
import { createAtomSupervisor } from "./init/createAtomSupervisor.js";
import { ATOM_CHILD_INDEX, spawnAtomChild } from "./init/spawnAtomChild.js";
import type { AtomServer } from "./init/types/atomServer.js";
import { getAtomLogger } from "./lib/logging/getAtomLogger.js";

/** How long a process that died stays down before another takes its place. */
const RESTART_DELAY_MS = 1000;

/** One process serves. Told to run several, the first process only supervises the ones that do. */
function createAtom(): AtomServer {
	const env = getAtomEnv();
	const logger = getAtomLogger();
	const isSupervisor =
		env.ATOM_PROCESSES > 1 && process.env[ATOM_CHILD_INDEX] === undefined;
	if (!isSupervisor)
		return createAtomServer({ ctx: { logger }, config: { env } });
	return createAtomSupervisor({
		ctx: { spawnChild: spawnAtomChild, logger },
		config: {
			processes: env.ATOM_PROCESSES,
			restartDelayMs: RESTART_DELAY_MS,
		},
	});
}

async function main(): Promise<void> {
	try {
		const atomServer = createAtom();
		registerShutdownSignals({ atomServer });
		await atomServer.start();
	} catch (cause) {
		reportError({ cause });
		process.exitCode = 1;
		await getAtomLogger().flush?.();
	}
}

function registerShutdownSignals({
	atomServer,
}: {
	atomServer: AtomServer;
}): void {
	async function shutdown(): Promise<void> {
		try {
			await atomServer.stop();
			process.exitCode = 0;
		} catch (cause) {
			reportError({ cause });
			process.exitCode = 1;
		} finally {
			await getAtomLogger().flush?.();
		}
	}

	process.once("SIGINT", shutdown);
	process.once("SIGTERM", shutdown);
}

function reportError({ cause }: { cause: unknown }): void {
	getAtomLogger().error({ error: cause, type: "atom_failed" }, "Atom failed");
}

void main();
