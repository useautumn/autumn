import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { log, fatal } from "./shell.ts";
import { getWorktreeList, getCurrentWorktree } from "./git.ts";
import { deleteBranch } from "./neon.ts";
import {
	REGISTRY_PATH,
	MAX_WORKTREE,
	BRANCH_NAME_RE,
	INACTIVITY_MS,
} from "../constants.ts";
import type { Registry, RegistryEntry } from "../types.ts";

export function shortHash(input: string): string {
	return createHash("sha1").update(input).digest("hex").slice(0, 6);
}

export function loadRegistry(): Registry {
	if (!existsSync(REGISTRY_PATH)) return {};
	try {
		return JSON.parse(readFileSync(REGISTRY_PATH, "utf-8"));
	} catch {
		log(`registry at ${REGISTRY_PATH} unreadable, resetting`);
		return {};
	}
}

export function saveRegistry(reg: Registry): void {
	writeFileSync(REGISTRY_PATH, JSON.stringify(reg, null, 2));
}

export function allocateWorktreeNumber(
	path: string,
	registry: Registry,
	canonical: string,
): number {
	if (path === canonical) return 1;
	const used = new Set<number>(
		Object.values(registry).map((e) => e.worktreeNum),
	);
	used.add(1);
	const preferred = (parseInt(shortHash(path), 16) % (MAX_WORKTREE - 1)) + 2;
	for (let i = 0; i < MAX_WORKTREE; i++) {
		const candidate = ((preferred - 2 + i) % (MAX_WORKTREE - 1)) + 2;
		if (!used.has(candidate)) return candidate;
	}
	fatal(`no free worktree slot under ${MAX_WORKTREE}`);
}

export function deriveBranchName(path: string, worktreeNum: number): string {
	return `dw-wt-${worktreeNum}-${shortHash(path)}`;
}

export function reconcile(registry: Registry): Registry {
	const live = new Set(getWorktreeList());
	const next: Registry = {};
	const now = Date.now();
	const orphaned: RegistryEntry[] = [];

	for (const [path, entry] of Object.entries(registry)) {
		if (entry.worktreeNum === 1) {
			next[path] = entry;
			continue;
		}
		const lastUsed = entry.lastUsedAt ?? entry.createdAt;
		const tooStale = now - lastUsed > INACTIVITY_MS;
		if (!live.has(path)) {
			orphaned.push(entry);
		} else if (tooStale) {
			log(
				`reconcile: ${entry.path} unused for ${Math.round(
					(now - lastUsed) / (24 * 60 * 60 * 1000),
				)}d, dropping`,
			);
			orphaned.push(entry);
		} else {
			next[path] = entry;
		}
	}

	for (const o of orphaned) {
		if (!o.branchName || !BRANCH_NAME_RE.test(o.branchName)) continue;
		deleteBranch(o.branchName);
	}
	return next;
}

export function hasOtherActiveWorktrees(
	registry: Registry,
	currentPath: string,
): boolean {
	return Object.entries(registry).some(
		([p, e]) => p !== currentPath && e.worktreeNum > 1,
	);
}

export function resolveAgentEntryOrFatal(action: string): RegistryEntry {
	const cwd = getCurrentWorktree();
	const registry = loadRegistry();
	const entry = registry[cwd];
	if (!entry || entry.worktreeNum === 1) {
		fatal(`${action} only valid in a registered agent worktree`);
	}
	return entry;
}
