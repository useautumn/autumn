import { existsSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";

let hasLoadedLocalEnv = false;
const shouldLogLocalEnvLoading = false;

/** Directory that actually contains ENV_FILE. Monorepo-root package.json is not a match. */
export const resolveEnvDir = ({
	cwd = process.cwd(),
	envFileName = process.env.ENV_FILE || ".env",
}: {
	cwd?: string;
	envFileName?: string;
} = {}): string => {
	const candidates = [
		join(cwd, "server"),
		cwd,
		join(cwd, "autumn", "server"),
	];
	for (const dir of candidates) {
		if (existsSync(join(dir, envFileName))) return dir;
	}
	return cwd.includes("server") ? cwd : join(cwd, "server");
};

export const loadLocalEnv = ({ force = false }: { force?: boolean } = {}) => {
	if (hasLoadedLocalEnv && !force) return;
	hasLoadedLocalEnv = true;

	const serverDir = resolveEnvDir();

	// Determine which env file to load based on ENV_FILE environment variable
	// Defaults to .env if not specified
	const envFileName = process.env.ENV_FILE || ".env";
	const envPath = join(serverDir, envFileName);

	// Load local .env file FIRST - these will take precedence over Infisical
	const result = config({ path: envPath });
	if (result.parsed) {
		if (shouldLogLocalEnvLoading) {
			// Use stderr so output doesn't pollute stdout for scripts using shell substitution
			console.error(
				`📄 Loading ${Object.keys(result.parsed).length} variables from ${envFileName}`,
			);
		}
		for (const [key, value] of Object.entries(result.parsed)) {
			process.env[key] = value;
		}
	} else {
		if (shouldLogLocalEnvLoading) {
			console.error(
				`ℹ️  No ${envFileName} file found (using only Infisical secrets)`,
			);
		}
	}
};
