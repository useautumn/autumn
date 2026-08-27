import { isCloudAgent } from "@autumn/env";
import { LOCAL_DATABASE_URL } from "../constants.ts";
import { ensurePublicAccess } from "../helpers/cloudflare.ts";
import { writeEnvLocalFiles } from "../helpers/env-files.ts";
import { ensureLocalInfra } from "../helpers/localInfra.ts";
import {
	loadRegistry,
	registerCurrentWorktree,
	saveRegistry,
} from "../helpers/registry.ts";
import { autoEnsureLocalTestOrg } from "../helpers/setup.ts";
import { fatal, log } from "../helpers/shell.ts";
import type { RegistryEntry } from "../types.ts";

/** Per-boot Cloud/Devin path: local infra + public URL. No bun install, no skill sync. */
export async function cmdStart(): Promise<RegistryEntry> {
	if (process.env.NODE_ENV === "production") {
		fatal("bun dw is disabled in production");
	}

	const entry0 = registerCurrentWorktree();
	log(
		`starting worktree ${entry0.worktreeNum}${entry0.branchName ? ` (${entry0.branchName})` : ""}`,
	);

	ensureLocalInfra();
	if (isCloudAgent()) {
		await autoEnsureLocalTestOrg();
		writeEnvLocalFiles({
			...entry0,
			databaseUrl: LOCAL_DATABASE_URL,
		});
	}
	const entry = await ensurePublicAccess(entry0);
	const registry = loadRegistry();
	registry[entry.path] = entry;
	saveRegistry(registry);
	return entry;
}
