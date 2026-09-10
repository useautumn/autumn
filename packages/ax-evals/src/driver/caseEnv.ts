import { join } from "node:path";

/** Env for a spawned agent CLI: the workspace's own .bin first on PATH (bare
 * `atmn` resolves like after a real npm install), host Autumn keys dropped so
 * the per-run key in cwd/.env wins. */
export const buildCaseEnv = ({
	cwd,
	extraEnv,
}: {
	cwd: string;
	extraEnv?: Record<string, string>;
}): Record<string, string | undefined> => {
	const env: Record<string, string | undefined> = {
		...process.env,
		...extraEnv,
		PATH: `${join(cwd, "node_modules/.bin")}:${process.env.PATH ?? ""}`,
	};
	// Infisical injects a host AUTUMN_SECRET_KEY that is not in this
	// worktree's DB; atmn prefers process.env over the workspace .env.
	delete env.AUTUMN_SECRET_KEY;
	delete env.AUTUMN_PROD_SECRET_KEY;
	return env;
};
