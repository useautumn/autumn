import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import {
	findEnvFile,
	upsertEnvContent,
	writeEnvValues,
} from "../../env/loadEnv";
import type { WebhookEnv } from "./types/webhookEnv";
import { webhookSecretName } from "./webhookSecretName";

const PROD_ENV_FILE = ".env.prod";

/** Beside the env file atmn reads first, so a project keeps its env files together. */
const prodEnvPath = ({ envDirs }: { envDirs: string[] }): string => {
	const nearest = findEnvFile({ dirs: envDirs });
	return join(
		nearest === undefined ? (envDirs[0] ?? process.cwd()) : dirname(nearest),
		PROD_ENV_FILE,
	);
};

/**
 * Prod secrets go to `.env.prod`; a sandbox's go where atmn writes its keys
 * (`.env.local`, else `.env`). One printed line per secret: its name and file.
 */
export const writeWebhookSecrets = async ({
	secrets,
	env,
	envDirs,
	cwd,
}: {
	secrets: { id: string; secret: string }[];
	env: WebhookEnv;
	envDirs: string[];
	cwd: string;
}): Promise<string[]> => {
	if (secrets.length === 0) return [];
	const orgId = env.live ? undefined : await env.orgId();
	const values = Object.fromEntries(
		secrets.map(({ id, secret }) => [webhookSecretName({ id, orgId }), secret]),
	);
	let path: string;
	if (env.live) {
		path = prodEnvPath({ envDirs });
		const content = existsSync(path) ? readFileSync(path, "utf8") : "";
		// A new prod file holds a live signing secret: owner-only from the start.
		writeFileSync(path, upsertEnvContent({ content, values }), { mode: 0o600 });
	} else {
		path = writeEnvValues({ dirs: envDirs, values });
	}
	const file = relative(cwd, path) || path;
	return Object.keys(values).map(
		(name) => `Saved webhook secret as ${name} in ${file}`,
	);
};
