import { isMainThread } from "node:worker_threads";
import { getAtomEnv } from "@autumn/env/atom";
import type { AtomServer } from "./init/types/atomServer.js";
import { getAtomLogger } from "./lib/logging/getAtomLogger.js";
import { startWalCheckpointer } from "./state/startWalCheckpointer.js";
import { createAtomThreads } from "./threads/createAtomThreads.js";
import { runAtomThread } from "./threads/runAtomThread.js";

/** The main thread starts the serving threads, each this same program, and copies their SQLite logs back into the files. */
function createAtom(): AtomServer {
	const env = getAtomEnv();
	const logger = getAtomLogger();
	const threads = createAtomThreads({
		// The program's entry, not this module: Alien's build wraps main.ts in a bootstrap, and a non-entry module's URL is its source path.
		ctx: { spawnThread: () => new Worker(Bun.main), logger },
		config: { env },
	});
	const walCheckpointer = startWalCheckpointer({
		dataDir: env.ATOM_DATA_DIR,
		logger,
	});
	return {
		start: threads.start,
		stop: async () => {
			await threads.stop();
			walCheckpointer.stop();
		},
	};
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

// One program for every thread: a compiled Atom is a single file, so a serving thread is the program started again.
if (isMainThread) void main();
else runAtomThread();
