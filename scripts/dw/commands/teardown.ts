import { log, fatal } from "../helpers/shell.ts";
import { getCurrentWorktree } from "../helpers/git.ts";
import {
	loadRegistry,
	saveRegistry,
	hasOtherActiveWorktrees,
} from "../helpers/registry.ts";
import { isPlainCanonical } from "../helpers/entry.ts";
import { deleteBranch } from "../helpers/neon.ts";
import { deleteReservedDomain } from "../helpers/ngrok.ts";
import { unregisterPortlessAliases } from "../helpers/portless.ts";
import { tmuxSessionName, killTmuxSession } from "../helpers/tmux.ts";
import { removeComposeStack, removeAllAutumnComposeStacks } from "../helpers/compose.ts";
import { removeEnvLocalFiles } from "../helpers/env-files.ts";
import { stopEmulateAndPortless } from "../helpers/emulate.ts";
import type { Registry, RegistryEntry } from "../types.ts";

export async function cmdTeardown(opts: { all?: boolean }): Promise<void> {
	let registry = loadRegistry();

	if (opts.all) {
		for (const entry of Object.values(registry)) {
			if (isPlainCanonical(entry)) continue;
			await teardownEntry(entry);
		}
		removeAllAutumnComposeStacks();
		const next: Registry = {};
		for (const [p, e] of Object.entries(registry)) {
			if (e.worktreeNum === 1) {
				next[p] = {
					path: e.path,
					worktreeNum: 1,
					createdAt: e.createdAt,
					lastUsedAt: Date.now(),
				};
			}
		}
		saveRegistry(next);
		removeEnvLocalFiles();
		stopEmulateAndPortless();
		log("teardown --all complete");
		return;
	}

	const cwd = getCurrentWorktree();
	const entry = registry[cwd];
	if (!entry) {
		log(`no registry entry for ${cwd}, nothing to teardown`);
		return;
	}
	if (isPlainCanonical(entry)) {
		fatal("refusing to teardown canonical worktree (worktreeNum=1)");
	}

	await teardownEntry(entry);
	if (entry.worktreeNum === 1) {
		registry[cwd] = {
			path: entry.path,
			worktreeNum: 1,
			createdAt: entry.createdAt,
			lastUsedAt: Date.now(),
		};
	} else {
		delete registry[cwd];
	}
	saveRegistry(registry);
	removeEnvLocalFiles();
	log(`tore down ${entry.branchName ?? "worktree " + entry.worktreeNum}`);

	if (!hasOtherActiveWorktrees(registry, cwd)) {
		stopEmulateAndPortless();
	} else {
		log("other agent worktrees still active; leaving emulate + portless running");
	}
}

async function teardownEntry(entry: RegistryEntry): Promise<void> {
	if (entry.branchName) {
		deleteBranch(entry.branchName, { projectId: entry.neonProjectId });
	}
	if (entry.reservedDomainId) {
		await deleteReservedDomain(entry.reservedDomainId);
	}
	if (entry.worktreeNum > 1) {
		unregisterPortlessAliases(entry.worktreeNum);
		killTmuxSession(tmuxSessionName(entry.worktreeNum));
	}
	removeComposeStack(entry.worktreeNum, entry.branchName);
}
