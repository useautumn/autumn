import type { AtomEnv } from "@autumn/env/atom";
import { createDeployedAuth } from "../auth/createDeployedAuth.js";
import type { Auth } from "../auth/types/auth.js";
import { createAtomApp } from "../http/createAtomApp.js";
import { createMultiTenantAuth } from "../multiTenant/createMultiTenantAuth.js";
import type { MultiTenantContext } from "../multiTenant/multiTenantContext.js";
import { createPushReceiver } from "../pushes/createPushReceiver.js";
import type { PushReceiver } from "../pushes/types/pushReceiver.js";
import type { AtomProcessRole } from "./types/atomProcessRole.js";
import type {
	AtomServer,
	AtomServerConfig,
	AtomServerDependencies,
} from "./types/atomServer.js";

/** An org's deployment is given its one token hash, and its writers lease Autumn's pushes; a multi-tenant Atom adds orgs as the admin registers them. */
const openAuth = ({
	ctx,
	env,
	role,
}: {
	ctx: AtomServerDependencies;
	env: AtomEnv;
	role: AtomProcessRole;
}): {
	auth: Auth;
	multiTenant?: MultiTenantContext;
	pushReceiver?: PushReceiver;
} => {
	if (env.ATOM_MODE === "deployed") {
		const auth = createDeployedAuth({
			dataDir: env.ATOM_DATA_DIR,
			tokenHash: env.ATOM_TOKEN_HASH,
			slotCount: env.ATOM_SLOT_COUNT,
		});
		const pushReceiver = role.receivesPushes
			? createPushReceiver({
					ctx: { slots: auth.slots, logger: ctx.logger },
				})
			: undefined;
		return { auth, pushReceiver };
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
	const { auth, multiTenant, pushReceiver } = openAuth({ ctx, env, role });
	const app = createAtomApp({
		ctx: {
			auth,
			multiTenant,
			logger: ctx.logger,
			autumnApiUrl: env.ATOM_AUTUMN_API_URL,
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
			fetch: app.fetch,
		});
		ctx.logger.info(
			`Atom listening at http://${env.ATOM_HOSTNAME}:${env.ATOM_PORT}`,
		);
	}

	/** A writer never listens: the port hands connections only to the processes serving checks. */
	async function start(): Promise<void> {
		if (role.servesChecks) listen();
		receiving = pushReceiver?.run().catch((error) => {
			ctx.logger.error(
				{ error, type: "atom_push_receiver_stopped" },
				"Push receiver stopped",
			);
			// A process that only writes is useless without its receiver: exiting lets the supervisor replace it.
			if (!role.servesChecks) throw error;
		});
	}

	/** In-flight requests and leased pushes finish before the files close. */
	async function stop(): Promise<void> {
		pushReceiver?.stop();
		await Promise.all([listener?.stop(), receiving]);
		auth.close();
	}

	return { start, stop };
};
