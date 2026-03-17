import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Low-level .env file reading/writing utilities
 */

export interface DotenvEntry {
	key: string;
	value: string;
}

/**
 * Parse .env file content into key-value pairs
 */
export function parseDotenv(content: string): Map<string, string> {
	const entries = new Map<string, string>();

	for (const line of content.split("\n")) {
		const trimmed = line.trim();

		// Skip comments and empty lines
		if (!trimmed || trimmed.startsWith("#")) {
			continue;
		}

		// Parse KEY=VALUE
		const match = trimmed.match(/^([^=]+)=(.*)$/);
		if (match) {
			const [, key, value] = match;
			if (key && value !== undefined) {
				// Remove quotes if present
				const cleanValue = value.replace(/^["']|["']$/g, "");
				entries.set(key.trim(), cleanValue);
			}
		}
	}

	return entries;
}

/**
 * Read a .env file and return parsed entries
 */
export function readDotenvFile(filePath: string): Map<string, string> {
	if (!existsSync(filePath)) {
		return new Map();
	}

	try {
		const content = readFileSync(filePath, "utf-8");
		return parseDotenv(content);
	} catch (_error) {
		return new Map();
	}
}

/**
 * Write entries to a .env file
 */
export function writeDotenvFile(
	filePath: string,
	entries: Map<string, string>,
): void {
	const lines = Array.from(entries.entries())
		.map(([key, value]) => {
			// Quote values that contain spaces
			const quotedValue = value.includes(" ") ? `"${value}"` : value;
			return `${key}=${quotedValue}`;
		})
		.join("\n");

	writeFileSync(filePath, `${lines}\n`, "utf-8");
}

/**
 * Get value from environment
 * Precedence: process.env → .env.local → .env
 */
export function getDotenvValue(
	key: string,
	cwd = process.cwd(),
): string | undefined {
	// 1. Check process.env first (for environment variables set in shell)
	if (process.env[key]) {
		return process.env[key];
	}

	// 2. Check .env.local
	const localPath = resolve(cwd, ".env.local");
	const localEntries = readDotenvFile(localPath);
	if (localEntries.has(key)) {
		return localEntries.get(key);
	}

	// 3. Check .env
	const envPath = resolve(cwd, ".env");
	const envEntries = readDotenvFile(envPath);
	return envEntries.get(key);
}

/**
 * Set value in .env file (always writes to .env, not .env.local)
 */
export function setDotenvValue(
	key: string,
	value: string,
	cwd = process.cwd(),
): void {
	const envPath = resolve(cwd, ".env");
	const entries = readDotenvFile(envPath);
	entries.set(key, value);
	writeDotenvFile(envPath, entries);
}

/**
 * Remove specific keys from .env file, preserving all other lines (comments, blank lines, other keys).
 * Only removes lines that are uncommented and match one of the given keys.
 * Returns the list of keys that were actually removed.
 */
export function removeKeysFromEnv(
	keys: string[],
	cwd = process.cwd(),
): string[] {
	const envPath = resolve(cwd, ".env");

	if (!existsSync(envPath)) {
		return [];
	}

	const content = readFileSync(envPath, "utf-8");
	const lines = content.split("\n");
	const removed = new Set<string>();

	const filtered = lines.filter((line) => {
		const trimmed = line.trim();

		// Keep comments and blank lines
		if (!trimmed || trimmed.startsWith("#")) {
			return true;
		}

		// Check if this uncommented line matches one of the keys to remove
		for (const key of keys) {
			if (trimmed.startsWith(`${key}=`)) {
				removed.add(key);
				return false;
			}
		}

		return true;
	});

	if (removed.size > 0) {
		const endsWithNewline = content.endsWith("\n");
		let output = filtered.join("\n");
		if (endsWithNewline && !output.endsWith("\n")) {
			output += "\n";
		}
		writeFileSync(envPath, output, "utf-8");
	}

	return [...removed];
}
