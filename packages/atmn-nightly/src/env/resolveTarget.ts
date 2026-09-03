const LOCAL_HOST = "http://localhost";
const DEFAULT_LOCAL_PORT = 8080;

export type TargetFlags = {
	prod?: boolean;
	local?: boolean;
	port?: string;
	baseUrl?: string;
};

export type Target = {
	/** Undefined means the generated client's default (the spec's server). */
	baseUrl?: string;
	secretKeyName: "AUTUMN_SECRET_KEY" | "AUTUMN_PROD_SECRET_KEY";
};

/**
 * Where to send, and which key to send it with.
 *
 * The most specific target wins: `--base-url`, then `--local`/`--port`, then
 * `AUTUMN_BASE_URL`, then the spec's server. Ranking rather than refusing
 * means a scripted `-l` can be overridden by an ad-hoc `-b` without editing
 * the script. The env var exists so a directory can pin itself to a local
 * server through its own `.env` — the default is production.
 */
export const resolveTarget = ({
	prod,
	local,
	port,
	baseUrl,
}: TargetFlags): Target => {
	const secretKeyName = prod ? "AUTUMN_PROD_SECRET_KEY" : "AUTUMN_SECRET_KEY";

	if (baseUrl) return { baseUrl, secretKeyName };
	// A port implies the host: `--port 3001` alone is a local target.
	if (local || port) {
		return {
			baseUrl: `${LOCAL_HOST}:${port ?? DEFAULT_LOCAL_PORT}`,
			secretKeyName,
		};
	}

	const fromEnv = process.env.AUTUMN_BASE_URL;
	return fromEnv ? { baseUrl: fromEnv, secretKeyName } : { secretKeyName };
};

export const requireSecretKey = ({ target }: { target: Target }): string => {
	const key = process.env[target.secretKeyName];
	if (!key) {
		throw new Error(
			`${target.secretKeyName} is not set. Put it in your .env, or export it before running.`,
		);
	}
	return key;
};
