import { parentPort } from "node:worker_threads";
import { openAuth } from "../auth/openAuth.js";
import { startSelfProfile } from "../diagnostics/startSelfProfile.js";
import { createAtomServer } from "../init/createAtomServer.js";
import { startProcessStats } from "../init/processStats.js";
import { getAtomLogger } from "../lib/logging/getAtomLogger.js";
import { checkPhaseMs } from "../processor/actions/check/checkPhaseMs.js";
import { checkTimeouts } from "../processor/actions/check/checkTimeouts.js";
import { pushPhaseMs } from "../pushes/pushPhaseMs.js";
import { subjectReadCounts } from "../state/openSqliteStore.js";
import { answerOwnerCalls } from "./owners/answerOwnerCalls.js";
import { createSlotOwners } from "./owners/createSlotOwners.js";
import { receivesPushes, servesHttp } from "./receivesPushes.js";
import type {
	PeerPorts,
	ThreadControl,
	ThreadInit,
	ThreadStatus,
} from "./types/threadMessages.js";

/** One serving thread: its server, and its lines to the other threads, kept current as they come and go. */
const openThread = ({ init }: { init: ThreadInit }) => {
	const { env, index } = init;
	const logger = getAtomLogger();
	const checkSheds = new Int32Array(init.checkSheds);
	const owners = createSlotOwners({
		index,
		threads: env.ATOM_THREADS,
		checkSheds,
	});
	const { auth, multiTenant } = openAuth({ env, owners });
	const answerPorts = new Map<number, MessagePort>();
	const receives = receivesPushes({
		index,
		threads: env.ATOM_THREADS,
		receivers: env.ATOM_PUSH_RECEIVERS,
	});
	const server = createAtomServer({
		ctx: {
			auth,
			multiTenant,
			logger,
			health: {
				bootedAt: init.bootedAt,
				restarts: new Int32Array(init.restarts),
			},
			processStats: startProcessStats({
				index,
				logger,
				subjectReadCounts: () => subjectReadCounts,
				checkPhaseTotals: () => checkPhaseMs,
				pushPhaseTotals: () => pushPhaseMs,
				checkOutcomeTotals: () => ({
					timeouts: checkTimeouts.count,
					sheds: Atomics.load(checkSheds, index),
				}),
			}),
		},
		config: {
			env,
			receivesPushes: receives,
			servesHttp: servesHttp({
				receives,
				receiversServeHttp: env.ATOM_PUSH_RECEIVERS_SERVE_HTTP,
			}),
		},
	});

	const selfProfile = env.ATOM_PROFILE_EVERY_S
		? startSelfProfile({
				everySeconds: env.ATOM_PROFILE_EVERY_S,
				index,
				logger,
			})
		: null;

	async function stop(): Promise<void> {
		selfProfile?.stop();
		await server.stop();
	}

	function join({ peer, ports }: { peer: number; ports: PeerPorts }): void {
		owners.connect({ thread: peer, port: ports.calls });
		answerOwnerCalls({ ctx: { auth }, port: ports.answers });
		answerPorts.set(peer, ports.answers);
	}

	function leave({ peer }: { peer: number }): void {
		owners.disconnect({ thread: peer });
		answerPorts.get(peer)?.close();
		answerPorts.delete(peer);
	}

	return { start: server.start, stop, join, leave };
};

/** Runs in a worker the main thread started: everything it does is told to it, in order, over its parent port. */
export const runAtomThread = (): void => {
	const main = parentPort;
	if (!main) throw new Error("runAtomThread runs in a worker thread");
	const report = (status: ThreadStatus) => main.postMessage(status);
	let thread: ReturnType<typeof openThread> | undefined;

	async function receive(control: ThreadControl): Promise<void> {
		if (control.type === "init") {
			thread = openThread({ init: control });
			await thread.start();
			report({ type: "ready" });
		} else if (control.type === "peerJoined")
			thread?.join({ peer: control.index, ports: control.ports });
		else if (control.type === "peerLeft")
			thread?.leave({ peer: control.index });
		else {
			await thread?.stop();
			report({ type: "stopped" });
		}
	}

	main.on("message", receive);
};
