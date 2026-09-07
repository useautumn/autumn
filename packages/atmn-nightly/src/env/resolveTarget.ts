import { CLI_CLIENT_ID } from "../auth/oauthConfig";

const LOCAL_HOST = "http://localhost";
const DEFAULT_LOCAL_PORT = 8080;

/** The spec's server: what every command talks to unless told otherwise. */
export const DEFAULT_BASE_URL = "https://api.useautumn.com";

/** The global flags every command shares; parsed once by the program. */
export type TargetFlags = {
	prod?: boolean;
	sandbox?: string;
	local?: boolean;
	port?: string;
	baseUrl?: string;
	clientId?: string;
};

export type Target = {
	/** Undefined means the generated client's default (the spec's server). */
	baseUrl?: string;
	secretKeyName: "AUTUMN_SECRET_KEY" | "AUTUMN_PROD_SECRET_KEY";
	/** The OAuth client the CLI identifies as; flag, then env, then the registered default. */
	clientId: string;
	/** A named sandbox to address instead of the org's default one. Carried, not yet consumed. */
	sandboxId?: string;
};

/**
 * Where to send, which key to send it with, and who the CLI says it is.
 *
 * The most specific target wins: `--base-url`, then `--local`/`--port`, then
 * `AUTUMN_BASE_URL`, then the spec's server. Ranking rather than refusing
 * means a scripted `-l` can be overridden by an ad-hoc `-b` without editing
 * the script. The env var exists so a directory can pin itself to a local
 * server through its own `.env` — the default is production.
 */
export const resolveTarget = ({
	prod,
	sandbox,
	local,
	port,
	baseUrl,
	clientId,
}: TargetFlags): Target => {
	const identity: Omit<Target, "baseUrl"> = {
		secretKeyName: prod ? "AUTUMN_PROD_SECRET_KEY" : "AUTUMN_SECRET_KEY",
		clientId:
			clientId ??
			process.env.AUTUMN_CLIENT_ID ??
			process.env.ATMN_CLI_CLIENT_ID ??
			CLI_CLIENT_ID,
		...((sandbox ?? process.env.AUTUMN_SANDBOX_ID)
			? { sandboxId: sandbox ?? process.env.AUTUMN_SANDBOX_ID }
			: {}),
	};

	if (baseUrl) return { baseUrl, ...identity };
	// A port implies the host: `--port 3001` alone is a local target.
	if (local || port) {
		return {
			baseUrl: `${LOCAL_HOST}:${port ?? DEFAULT_LOCAL_PORT}`,
			...identity,
		};
	}

	const fromEnv = process.env.AUTUMN_BASE_URL;
	return fromEnv ? { baseUrl: fromEnv, ...identity } : identity;
};

/** The concrete URL a command should hit: the target's, else the spec's server. */
export const targetBaseUrl = ({ target }: { target: Target }): string =>
	target.baseUrl ?? DEFAULT_BASE_URL;

export const requireSecretKey = ({ target }: { target: Target }): string => {
	const key = process.env[target.secretKeyName];
	if (!key) {
		throw new Error(
			`${target.secretKeyName} is not set. Put it in your .env, or export it before running.`,
		);
	}
	return key;
};
