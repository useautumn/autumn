import { fetchInvalidKeys } from "../auth/secretKeys/fetchInvalidKeys.js";
import { startSecretKeys } from "../auth/secretKeys/startSecretKeys.js";
import { getAutumnClient } from "../autumnClient/getAutumnClient.js";
import { createAtomApp } from "../http/createAtomApp.js";
import { createPushReceiver } from "../pushes/createPushReceiver.js";
import { getPushQueue } from "../pushQueue/getPushQueue.js";
import { startThreadStatsTick } from "../threads/stats/startThreadStatsTick.js";
import type {
	AtomServer,
	AtomServerConfig,
	AtomServerDependencies,
} from "./types/atomServer.js";

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
	const app = createAtomApp({
		ctx: {
			auth: ctx.auth,
			multiTenant: ctx.multiTenant,
			logger: ctx.logger,
			health: ctx.health,
			counters: ctx.counters,
			autumnApiUrl: env.ATOM_AUTUMN_API_URL,
			secretKeys,
		},
	});
	const statsTick = startThreadStatsTick({
		counters: ctx.counters,
		held: ctx.held,
	});
	let listener: ReturnType<typeof Bun.serve> | undefined;
	let receiving: Promise<void> | undefined;

	function listen(): void {
		listener = Bun.serve({
			hostname: env.ATOM_HOSTNAME,
			port: env.ATOM_PORT,
			// Every thread listens on the one port, and Linux gives each connection to one of them.
			reusePort: true,
			fetch: app.fetch,
		});
	}

	/** Receiving is async I/O beside serving, so a thread that receives pushes still answers checks. */
	async function start(): Promise<void> {
		listen();
		receiving = pushReceiver?.run();
	}

	/** In-flight requests and leased pushes finish before the files close. */
	async function stop(): Promise<void> {
		pushReceiver?.stop();
		await Promise.all([listener?.stop(), receiving]);
		statsTick.stop();
		secretKeys?.stop();
		ctx.auth.close();
	}

	return { start, stop };
};
