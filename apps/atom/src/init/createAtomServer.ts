import type { AtomEnv } from "@autumn/env/atom";
import { createDeployedAuth } from "../auth/createDeployedAuth.js";
import type { Auth } from "../auth/types/auth.js";
import { createDevAuth } from "../dev/createDevAuth.js";
import type { DevContext } from "../dev/devContext.js";
import { createAtomApp } from "../http/createAtomApp.js";
import type {
	AtomServer,
	AtomServerConfig,
	AtomServerDependencies,
} from "./types/atomServer.js";

/** A dev stack adds Atoms as orgs deploy; an org's deployment is given its one token hash. */
const openAuth = ({
	env,
}: {
	env: AtomEnv;
}): { auth: Auth; dev?: DevContext } => {
	if (!env.ATOM_DEV)
		return {
			auth: createDeployedAuth({
				dataDir: env.ATOM_DATA_DIR,
				tokenHash: env.ATOM_TOKEN_HASH,
			}),
		};
	const auth = createDevAuth({ dataDir: env.ATOM_DATA_DIR });
	return { auth, dev: { auth } };
};

export const createAtomServer = ({
	ctx,
	config,
}: {
	ctx: AtomServerDependencies;
	config: AtomServerConfig;
}): AtomServer => {
	const { env } = config;
	const { auth, dev } = openAuth({ env });
	const app = createAtomApp({
		ctx: {
			auth,
			dev,
			logger: ctx.logger,
			autumnApiUrl: env.ATOM_AUTUMN_API_URL,
		},
	});
	let listener: ReturnType<typeof Bun.serve> | undefined;

	async function start(): Promise<void> {
		listener = Bun.serve({
			hostname: env.ATOM_HOSTNAME,
			port: env.ATOM_PORT,
			fetch: app.fetch,
		});
		ctx.logger.info(
			`Atom listening at http://${env.ATOM_HOSTNAME}:${env.ATOM_PORT}`,
		);
	}

	/** In-flight requests finish before the files close. */
	async function stop(): Promise<void> {
		await listener?.stop();
		auth.close();
	}

	return { start, stop };
};
