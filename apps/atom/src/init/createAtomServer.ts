import { queue } from "@alienplatform/bindings";
import type { AtomEnv } from "@autumn/env/atom";
import { createDeployedAuth } from "../auth/createDeployedAuth.js";
import type { Auth } from "../auth/types/auth.js";
import { createAtomApp } from "../http/createAtomApp.js";
import { createMultiTenantAuth } from "../multiTenant/createMultiTenantAuth.js";
import type { MultiTenantContext } from "../multiTenant/multiTenantContext.js";
import {
	createPushReceiver,
	PUSH_QUEUE,
} from "../pushes/createPushReceiver.js";
import type {
	AtomServer,
	AtomServerConfig,
	AtomServerDependencies,
} from "./types/atomServer.js";

/** An org's deployment is given its one token hash; a multi-tenant Atom adds orgs as the admin registers them. */
const openAuth = ({
	env,
}: {
	env: AtomEnv;
}): {
	auth: Auth;
	multiTenant?: MultiTenantContext;
} => {
	if (env.ATOM_MODE === "deployed") {
		const auth = createDeployedAuth({
			dataDir: env.ATOM_DATA_DIR,
			tokenHash: env.ATOM_TOKEN_HASH,
			slotCount: env.ATOM_SLOT_COUNT,
		});
		return { auth };
	}
	const auth = createMultiTenantAuth({
		dataDir: env.ATOM_DATA_DIR,
		slotCount: env.ATOM_SLOT_COUNT,
	});
	return {
		auth,
		multiTenant: { auth, adminTokenHash: env.ATOM_TOKEN_HASH },
	};
};

export const createAtomServer = ({
	ctx,
	config,
}: {
	ctx: AtomServerDependencies;
	config: AtomServerConfig;
}): AtomServer => {
	const { env, role } = config;
	const { auth, multiTenant } = openAuth({ env });
	const pushReceiver = role.receivesPushes
		? createPushReceiver({
				ctx: {
					pushes: queue(PUSH_QUEUE),
					auth,
					logger: ctx.logger,
					processStats: ctx.processStats,
				},
			})
		: undefined;
	const app = createAtomApp({
		ctx: {
			auth,
			multiTenant,
			logger: ctx.logger,
			processStats: ctx.processStats,
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
			// Several processes listen on the one port, and Linux gives each connection to one of them.
			reusePort: env.ATOM_PROCESSES > 1,
			fetch: (request, server) => {
				const remote = server.requestIP(request);
				ctx.processStats?.noteArrival({
					remote: remote ? `${remote.address}:${remote.port}` : null,
				});
				return app.fetch(request, server);
			},
		});
		ctx.logger.info(
			`Atom listening at http://${env.ATOM_HOSTNAME}:${env.ATOM_PORT}`,
		);
	}

	/** Receiving is async I/O beside serving, so a process that applies pushes still answers checks. */
	async function start(): Promise<void> {
		listen();
		receiving = pushReceiver?.run();
	}

	/** In-flight requests and leased pushes finish before the files close. */
	async function stop(): Promise<void> {
		pushReceiver?.stop();
		await Promise.all([listener?.stop(), receiving]);
		ctx.processStats?.stop();
		auth.close();
	}

	return { start, stop };
};
