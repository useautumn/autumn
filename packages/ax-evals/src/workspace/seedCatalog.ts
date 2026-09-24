import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

/** Push a config into the run org before the agent starts. The file stays in
 * the workspace — with the ids push wrote back — as the agent's starting point. */
export const seedCatalog = async ({
	workspaceDir,
	config,
	backendUrl,
	secretKey,
}: {
	workspaceDir: string;
	config: string;
	backendUrl: string;
	secretKey: string;
}) => {
	await writeFile(join(workspaceDir, "autumn.config.ts"), config);
	await run("atmn", ["push", "--yes"], {
		cwd: workspaceDir,
		env: {
			...process.env,
			PATH: `${join(workspaceDir, "node_modules/.bin")}:${process.env.PATH ?? ""}`,
			AUTUMN_BASE_URL: backendUrl,
			AUTUMN_SECRET_KEY: secretKey,
		},
	});
};
