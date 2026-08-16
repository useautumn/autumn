import { promoteAllUsersToAdmin } from "../commands/admin.ts";
import type { Registry, RegistryEntry } from "../types.ts";
import { ensureComposeStack } from "./compose.ts";
import { ensureEmulateRunning } from "./emulate.ts";
import { writeEnvLocalFiles } from "./env-files.ts";
import { ensureChatDatabase } from "./neon.ts";
import { ensureNgrok } from "./ngrok.ts";
import { saveRegistry } from "./registry.ts";
import {
	autoEnsureTestOrgSecretKey,
	autoSeedSlackInstall,
	autoSetupTestOrg,
	setupAgentWorktree,
} from "./setup.ts";
import { log } from "./shell.ts";

export async function provisionWorktree({
	entry,
	registry,
	cwd,
}: {
	entry: RegistryEntry;
	registry: Registry;
	cwd: string;
}): Promise<RegistryEntry> {
	let { entry: current, created } = await setupAgentWorktree(entry, registry);

	if (current.branchName) ensureChatDatabase(current.branchName);

	ensureComposeStack(current.worktreeNum, current.branchName);
	current = await ensureNgrok(current);
	registry[cwd] = current;
	saveRegistry(registry);

	writeEnvLocalFiles(current);
	ensureEmulateRunning({ origin: current.ngrokUrl });

	if (created) {
		log("first provision — seeding test org");
		await autoSetupTestOrg(current);
		await autoSeedSlackInstall(current);
		if (current.databaseUrl) {
			try {
				promoteAllUsersToAdmin(current.databaseUrl);
			} catch (err) {
				log(
					`admin promotion skipped: ${err instanceof Error ? err.message : String(err)}`,
				);
			}
		}
	}

	await autoEnsureTestOrgSecretKey(current);

	return current;
}
