import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { REGISTRY_DIR, REGISTRY_FILE } from "../constants.ts";
import type { SwRegistry, SwRegistryEntry } from "../types.ts";

export function loadRegistry(): SwRegistry {
	if (!existsSync(REGISTRY_FILE)) return {};
	try {
		return JSON.parse(readFileSync(REGISTRY_FILE, "utf8")) as SwRegistry;
	} catch {
		return {};
	}
}

export function saveRegistry(registry: SwRegistry): void {
	if (!existsSync(REGISTRY_DIR)) mkdirSync(REGISTRY_DIR, { recursive: true });
	writeFileSync(REGISTRY_FILE, `${JSON.stringify(registry, null, 2)}\n`);
}

export function upsertEntry(entry: SwRegistryEntry): void {
	const registry = loadRegistry();
	registry[entry.path] = entry;
	saveRegistry(registry);
}

export function getEntry(path: string): SwRegistryEntry | undefined {
	return loadRegistry()[path];
}

export function removeEntry(path: string): void {
	const registry = loadRegistry();
	delete registry[path];
	saveRegistry(registry);
}
