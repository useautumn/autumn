import { queue } from "@alienplatform/bindings";
import { createAtomApp } from "../http/createAtomApp.js";
import {
	createPushReceiver,
	PUSH_QUEUE,
} from "../pushes/createPushReceiver.js";
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
	const pushReceiver = config.receivesPushes
		? createPushReceiver({
				ctx: {
					pushes: queue(PUSH_QUEUE),
					auth: ctx.auth,
					logger: ctx.logger,
					processStats: ctx.processStats,
				},
			})
		: undefined;
	const app = createAtomApp({
		ctx: {
			auth: ctx.auth,
			multiTenant: ctx.multiTenant,
			logger: ctx.logger,
			processStats: ctx.processStats,
			health: ctx.health,
			autumnApiUrl: env.ATOM_AUTUMN_API_URL,
			dataDir: env.ATOM_DATA_DIR,
		},
	});
	let listener: ReturnType<typeof Bun.serve> | undefined;
	let receiving: Promise<void> | undefined;

	function listen(): void {
		listener = Bun.serve({
			hostname: env.ATOM_HOSTNAME,
			port: env.ATOM_PORT,
			// Every thread listens on the one port, and Linux gives each connection to one of them.
			reusePort: true,
			fetch: (request, server) => {
				const remote = server.requestIP(request);
				ctx.processStats?.noteArrival({
					remote: remote ? `${remote.address}:${remote.port}` : null,
				});
				return app.fetch(request, server);
			},
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
		ctx.processStats?.stop();
		ctx.auth.close();
	}

	return { start, stop };
};
