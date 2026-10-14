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
import { startLoopWatch } from "../threads/stats/startLoopWatch.js";
import { startThreadStatsTick } from "../threads/stats/startThreadStatsTick.js";
import type {
	AtomServer,
	AtomServerConfig,
	AtomServerDependencies,
} from "./types/atomServer.js";

export const createAtomServer = ({
	ctx,
	config,
}: {
	ctx: AtomServerDependencies;
	config: AtomServerConfig;
}): AtomServer => {
	const { env } = config;
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
		peer: { port: env.ATOM_PORT },
	};
	const app = createAtomApp({ ctx: httpContext });
	const peerApp = createPeerApp({
		ctx: httpContext,
		secret: env.ATOM_PEER_SECRET,
	});
	const statsTick = startThreadStatsTick({
		counters: ctx.counters,
		held: ctx.held,
	});
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
			fetch: app.fetch,
			logger: ctx.logger,
		});
		peerListener = serveAtomApp({
			hostname: env.ATOM_HOSTNAME,
			port: env.ATOM_PEER_PORT,
			fetch: peerApp.fetch,
			logger: ctx.logger,
		});
	}

	async function start(): Promise<void> {
		listen();
		receiving = pushReceiver?.run();
		void diskEvictor.run();
	}

	async function stop(): Promise<void> {
		pushReceiver?.stop();
		await Promise.all([listener?.stop(), peerListener?.stop(), receiving]);
		await ctx.replication.stop();
		diskEvictor.stop();
		statsTick.stop();
		loop.stop();
		secretKeys?.stop();
		ctx.auth.close();
	}

	return { start, stop };
};
