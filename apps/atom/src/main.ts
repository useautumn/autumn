import { getAtomEnv } from "@autumn/env/atom";
import { markAtomBoot } from "./init/atomHealth.js";
import { atomProcessRole } from "./init/atomProcessRole.js";
import { createAtomServer } from "./init/createAtomServer.js";
import { createAtomSupervisor } from "./init/createAtomSupervisor.js";
import { startProcessStats } from "./init/processStats.js";
import { ATOM_CHILD_INDEX, spawnAtomChild } from "./init/spawnAtomChild.js";
import type { AtomServer } from "./init/types/atomServer.js";
import { getAtomLogger } from "./lib/logging/getAtomLogger.js";
import { subjectReadCounts } from "./state/openSqliteStore.js";

/** How long a process that died stays down before another takes its place. */
const RESTART_DELAY_MS = 1000;

/** One process serves. Told to run several, the first process only supervises the ones that do. */
function createAtom(): AtomServer {
	const env = getAtomEnv();
	const logger = getAtomLogger();
	const childIndex = process.env[ATOM_CHILD_INDEX];
	const isSupervisor = env.ATOM_PROCESSES > 1 && childIndex === undefined;
	if (!isSupervisor) {
		const role = atomProcessRole({
			env,
			childIndex: childIndex === undefined ? null : Number(childIndex),
		});
		const processStats = startProcessStats({
			index: childIndex === undefined ? 0 : Number(childIndex),
			logger,
			subjectReadCounts: () => subjectReadCounts,
		});
		return createAtomServer({
			ctx: { logger, processStats },
			config: { env, role },
		});
	}
	const { recordRestarts } = markAtomBoot();
	return createAtomSupervisor({
		ctx: { spawnChild: spawnAtomChild, logger, recordRestarts },
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
