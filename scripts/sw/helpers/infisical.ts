import { fatal, log, sh } from "./shell.ts";

/**
 * Export the dev secrets as a dotenv blob from the Mac (the box has no infisical
 * auth). The remote provisioner merges this with the per-worktree DB/Redis/SQS
 * overrides to build the box's `server/.env.local`.
 */
export function exportDevDotenv(checkout: string): string {
	log("exporting dev secrets via infisical");
	const res = sh("infisical", ["export", "--env=dev", "--format=dotenv"], {
		cwd: checkout,
	});
	if (res.code !== 0) {
		fatal(`infisical export failed: ${res.stderr || res.stdout}`);
	}
	return res.stdout;
}
