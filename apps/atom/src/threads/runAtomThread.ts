import { parentPort } from "node:worker_threads";
import { openAuth } from "../auth/openAuth.js";
import { createAtomServer } from "../init/createAtomServer.js";
import type { AtomServer } from "../init/types/atomServer.js";
import { getAtomLogger } from "../lib/logging/getAtomLogger.js";
import type {
	ThreadControl,
	ThreadInit,
	ThreadStatus,
} from "./types/threadMessages.js";

/** One serving thread's server, on the data folder every thread shares. */
const openThread = ({ init }: { init: ThreadInit }): AtomServer => {
	const { env, index } = init;
	const { auth, multiTenant } = openAuth({ env });
	return createAtomServer({
		ctx: {
			auth,
			multiTenant,
			logger: getAtomLogger(),
			health: {
				bootedAt: init.bootedAt,
				restarts: new Int32Array(init.restarts),
			},
		},
		config: {
			env,
			// The highest-indexed threads receive pushes.
			receivesPushes: index >= env.ATOM_THREADS - env.ATOM_PUSH_RECEIVERS,
		},
	});
};

/** Runs in a worker the main thread started: everything it does is told to it, in order, over its parent port. */
export const runAtomThread = (): void => {
	const main = parentPort;
	if (!main) throw new Error("runAtomThread runs in a worker thread");
	const report = (status: ThreadStatus) => main.postMessage(status);
	let server: AtomServer | undefined;

	async function receive(control: ThreadControl): Promise<void> {
		if (control.type === "init") {
			server = openThread({ init: control });
			await server.start();
			report({ type: "ready" });
			return;
		}
		await server?.stop();
		report({ type: "stopped" });
	}

	// A failure here ends the thread, so the main thread replaces it; it is logged first, whatever Bun does with the rejection.
	main.on("message", (control: ThreadControl) =>
		receive(control).catch((error) => {
			getAtomLogger().error(
				{ error, type: "atom_thread_failed", data: { control: control.type } },
				"An Atom thread failed",
			);
			throw error;
		}),
	);
};
