import { existsSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";

let hasLoadedLocalEnv = false;
const shouldLogLocalEnvLoading = false;

/**
 * Resolve the directory holding `.env`, robust to cwd:
 *   - cwd already a `server/` dir
 *   - cwd is `autumn/` (typical workspace root)
 *   - cwd is the monorepo root (one level above `autumn/`) — happens with
 *     `bun test autumn/...` invocations from VSCode tasks
 */
const resolveServerDir = (): string => {
	const cwd = process.cwd();
	const candidates = [
		cwd,
		join(cwd, "server"),
		join(cwd, "autumn", "server"),
	];
	for (const dir of candidates) {
		if (existsSync(join(dir, "package.json"))) return dir;
	}
	// Fall back to first guess so dotenv silently no-ops if missing.
	return cwd.includes("server") ? cwd : join(cwd, "server");
};

export const loadLocalEnv = ({ force = false }: { force?: boolean } = {}) => {
	if (hasLoadedLocalEnv && !force) return;
	hasLoadedLocalEnv = true;

	const serverDir = resolveServerDir();

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
