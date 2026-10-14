import type { RegistryEntry } from "../types.ts";

export function isProvisioned(entry: RegistryEntry): boolean {
	return Boolean(entry.branchName);
}

export function isPlainCanonical(entry: RegistryEntry): boolean {
	return entry.worktreeNum === 1 && !entry.branchName;
}
