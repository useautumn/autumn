import { fetchInvalidKeys } from "../auth/secretKeys/fetchInvalidKeys.js";
import { startSecretKeys } from "../auth/secretKeys/startSecretKeys.js";
import { getAutumnClient } from "../autumnClient/getAutumnClient.js";
import { createDiskEvictor } from "../disk/createDiskEvictor.js";
import { readVolumeBytes } from "../disk/readVolumeBytes.js";
import { createAtomApp } from "../http/createAtomApp.js";
import { createPeerApp } from "../http/createPeerApp.js";
import { serveAtomApp } from "../http/serveAtomApp.js";
import { createPushReceiver } from "../pushes/createPushReceiver.js";
import { getPushQueue } from "../pushQueue/getPushQueue.js";
import { leaveRing } from "../replicas/handover/leaveRing.js";
import { timeStage } from "../threads/stats/stageClock.js";
import { startReadinessProber } from "../replicas/membership/startReadinessProber.js";
import { startLoopWatch } from "../threads/stats/startLoopWatch.js";
import { startThreadStatsTick } from "../threads/stats/startThreadStatsTick.js";
import type {
	AtomServer,
	AtomServerConfig,
	AtomServerDependencies,
} from "./types/atomServer.js";

/** Inside a typical 30 s grace before SIGKILL, leaving room for the replication flush (5 s) and closing the files. */
const DRAIN_DEADLINE_MS = 20_000;

/** One thread's server: it answers on the shared port and, when told to, receives Autumn's queued pushes. */
export const createAtomServer = ({
	ctx,
	config,
}: {
	ctx: AtomServerDependencies;
	config: AtomServerConfig;
}): AtomServer => {
	const { env } = config;
	// A queued push names the folder it lands in, so a multi-tenant Atom reads the queue like an org's own.
	const pushReceiver = config.receivesPushes
		? createPushReceiver({
				ctx: {
					pushQueue: getPushQueue({ env }),
					auth: ctx.auth,
					logger: ctx.logger,
					counters: ctx.counters,
					replication: ctx.replication,
				},
			})
		: undefined;
	// Each thread learns and checks its own keys: no state crosses threads, at a forward and a sync per thread.
	const secretKeys =
		env.ATOM_MODE === "deployed"
			? startSecretKeys({
					findInvalid: ({ keyHashes }) =>
						fetchInvalidKeys({
							ctx: {
								autumnClient: getAutumnClient({ env }),
								tokenHash: env.ATOM_TOKEN_HASH,
								logger: ctx.logger,
							},
							keyHashes,
						}),
				})
			: undefined;
	const loop = startLoopWatch();
	let stopping = false;
	const { membership, ring } = ctx;
	const peer = { port: env.ATOM_PEER_PORT, secret: env.ATOM_PEER_SECRET };
	const handoverContext = {
		ring,
		boot: ctx.health.bootedAt,
		membership,
		folders: ctx.folders,
		replication: ctx.replication,
		thread: ctx.health.thread,
		threads: env.ATOM_THREADS,
		publicPort: env.ATOM_PORT,
		peer,
		logger: ctx.logger,
	};
	const prober = startReadinessProber({ ctx: handoverContext });
	const httpContext = {
		auth: ctx.auth,
		multiTenant: ctx.multiTenant,
		logger: ctx.logger,
		health: ctx.health,
		counters: ctx.counters,
		loop,
		autumnApiUrl: env.ATOM_AUTUMN_API_URL,
		secretKeys,
		replication: ctx.replication,
		stopping: () => stopping,
		peer: { ...peer, ring, membership },
	};
	const app = createAtomApp({ ctx: httpContext });
	// The other replicas are listened to on the port the stack keeps off the public endpoint.
	const peerApp = createPeerApp({
		ctx: httpContext,
		secret: env.ATOM_PEER_SECRET,
	});
	const statsTick = startThreadStatsTick({
		counters: ctx.counters,
		held: ctx.held,
	});
	// The cap follows the mounted volume, so whatever disk the stack gives this replica, grown online included, counts.
	const diskEvictor = createDiskEvictor({
		ctx: {
			folders: ctx.folders,
			counters: ctx.counters,
			logger: ctx.logger,
		},
		volumeOf: () => readVolumeBytes({ path: env.ATOM_DATA_DIR }),
		threads: env.ATOM_THREADS,
	});
	let listener: ReturnType<typeof Bun.serve> | undefined;
	let peerListener: ReturnType<typeof Bun.serve> | undefined;
	let receiving: Promise<void> | undefined;

	function listen(): void {
		listener = serveAtomApp({
			hostname: env.ATOM_HOSTNAME,
			port: env.ATOM_PORT,
			fetch: (request) => timeStage("honoRoute", () => app.fetch(request)),
			logger: ctx.logger,
		});
		peerListener = serveAtomApp({
			hostname: env.ATOM_HOSTNAME,
			port: env.ATOM_PEER_PORT,
			fetch: (request) => timeStage("honoRoute", () => peerApp.fetch(request)),
			logger: ctx.logger,
		});
	}

	/** Receiving is async I/O beside serving, so a thread that receives pushes still answers checks. */
	async function start(): Promise<void> {
		listen();
		receiving = pushReceiver?.run();
		void diskEvictor.run();
		void prober.run();
	}

	/**
	 * First the ring: this replica owns nothing and its peers are told. Leased pushes finish and the journals drain to
	 * Autumn while both ports stay up: a public check hops to the new owner, a handed-on one is refused as leaving. Only
	 * then do the listeners and the files close.
	 */
	async function stop(): Promise<void> {
		prober.stop();
		await leaveRing({ ctx: handoverContext });
		pushReceiver?.stop();
		await receiving;
		await ctx.journalForwarder.drainAll({ deadlineMs: DRAIN_DEADLINE_MS });
		stopping = true;
		await listener?.stop();
		await peerListener?.stop();
		// After the last push applied here: what it relays must still reach the peers before the files close.
		await ctx.replication.stop();
		diskEvictor.stop();
		statsTick.stop();
		loop.stop();
		secretKeys?.stop();
		ctx.auth.close();
	}

	return { start, stop, probePeers: () => prober.probeOnce() };
};
