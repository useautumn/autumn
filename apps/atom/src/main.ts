import { getAtomEnv } from "@autumn/env/atom";
import { createAtomServer } from "./init/createAtomServer.js";
import type { AtomServer } from "./init/types/atomServer.js";
import { getAtomLogger } from "./lib/logging/getAtomLogger.js";

async function main(): Promise<void> {
	try {
		const atomServer = createAtomServer({
			ctx: { logger: getAtomLogger() },
			config: { env: getAtomEnv() },
		});
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
