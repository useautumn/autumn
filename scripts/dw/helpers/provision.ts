import { promoteAllUsersToAdmin } from "../commands/admin.ts";
import type { Registry, RegistryEntry } from "../types.ts";
import { isAmicable } from "./amicable.ts";
import { ensureComposeStack, readNgrokTunnelUrl } from "./compose.ts";
import { ensureEmulateRunning } from "./emulate.ts";
import { writeEnvLocalFiles } from "./env-files.ts";
import { ensureChatDatabase } from "./neon.ts";
import { ensureReservedDomain, ngrokApiAvailable } from "./ngrok.ts";
import { saveRegistry } from "./registry.ts";
import {
	autoSeedSlackInstall,
	autoSetupTestOrg,
	setupAgentWorktree,
} from "./setup.ts";
import { log } from "./shell.ts";
import { ensureConnectWebhook } from "./stripeWebhook.ts";

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

	let reservedDomain: string | undefined;
	if (ngrokApiAvailable() && process.env.NGROK_AUTHTOKEN) {
		const reserved = await ensureReservedDomain(
			current.worktreeNum,
			current.path,
		);
		current = {
			...current,
			reservedDomainId: reserved.id,
			ngrokUrl: `https://${reserved.domain}`,
		};
		reservedDomain = reserved.domain;
		registry[cwd] = current;
		saveRegistry(registry);
	}

	const { ngrokEnabled } = ensureComposeStack(
		current.worktreeNum,
		current.branchName,
		reservedDomain,
	);
	if (ngrokEnabled && !reservedDomain) {
		current = {
			...current,
			ngrokUrl: await readNgrokTunnelUrl(current.worktreeNum),
		};
		registry[cwd] = current;
		saveRegistry(registry);
	}

	if (isAmicable() && current.ngrokUrl) {
		await ensureConnectWebhook(current.ngrokUrl);
	}

	writeEnvLocalFiles(current);
	ensureEmulateRunning();

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

	return current;
}
