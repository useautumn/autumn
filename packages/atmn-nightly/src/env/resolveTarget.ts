import { CLI_CLIENT_ID } from "../auth/oauthConfig";
import {
	SANDBOX_PIN_NAME,
	type SandboxSecretKeyName,
	sandboxKeyName,
} from "./sandboxKeyName";

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

/** Every env var a command may authenticate with: the org's two, or a sandbox's own. */
export type SecretKeyName =
	| "AUTUMN_SECRET_KEY"
	| "AUTUMN_PROD_SECRET_KEY"
	| SandboxSecretKeyName;

export type Target = {
	/** Undefined means the generated client's default (the spec's server). */
	baseUrl?: string;
	secretKeyName: SecretKeyName;
	/** The OAuth client the CLI identifies as; flag, then env, then the registered default. */
	clientId: string;
	/** A named sandbox to address instead of the org's default one. */
	sandboxId?: string;
};

/** A sandbox's own key when one is pinned, else the org key `--prod` selects. */
const secretKeyNameFor = ({
	prod,
	sandboxId,
}: {
	prod: boolean;
	sandboxId: string | undefined;
}): SecretKeyName => {
	if (sandboxId !== undefined) return sandboxKeyName({ sandboxId });
	return prod ? "AUTUMN_PROD_SECRET_KEY" : "AUTUMN_SECRET_KEY";
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
	if (prod === true && sandbox !== undefined) {
		throw new Error("Pick one of --prod and --sandbox.");
	}
	// `--prod` overrides a pinned sandbox rather than combining with it: keeping
	// the pin would make the flag silently address the sandbox anyway.
	const sandboxId =
		prod === true ? undefined : (sandbox ?? process.env[SANDBOX_PIN_NAME]);

	const identity: Omit<Target, "baseUrl"> = {
		secretKeyName: secretKeyNameFor({ prod: prod === true, sandboxId }),
		clientId:
			clientId ??
			process.env.AUTUMN_CLIENT_ID ??
			process.env.ATMN_CLI_CLIENT_ID ??
			CLI_CLIENT_ID,
		...(sandboxId ? { sandboxId } : {}),
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

/**
 * `sandbox list|create|delete` are organization operations: the server refuses a
 * sandbox's own key for them, so they drop the pin and use the org key.
 */
export const managementTarget = ({ target }: { target: Target }): Target => {
	if (target.sandboxId === undefined) return target;
	return {
		...(target.baseUrl === undefined ? {} : { baseUrl: target.baseUrl }),
		secretKeyName: "AUTUMN_SECRET_KEY",
		clientId: target.clientId,
	};
};

const missingKeyMessage = ({ name }: { name: SecretKeyName }): string =>
	name === "AUTUMN_SECRET_KEY" || name === "AUTUMN_PROD_SECRET_KEY"
		? `${name} is not set. Put it in your .env, or export it before running.`
		: `${name} is not set. atmn sandbox create writes it when it mints a sandbox; for one you already have, put its key in your .env.`;

export const requireSecretKey = ({ target }: { target: Target }): string => {
	const key = process.env[target.secretKeyName];
	if (!key) throw new Error(missingKeyMessage({ name: target.secretKeyName }));
	return key;
};
