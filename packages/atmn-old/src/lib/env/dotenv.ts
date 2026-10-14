import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "dotenv";

export interface DotenvEntry {
	key: string;
	value: string;
}

export function parseDotenv(content: string): Map<string, string> {
	return new Map(Object.entries(parse(content)));
}

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

export function writeDotenvFile(
	filePath: string,
	entries: Map<string, string>,
): void {
	const lines = Array.from(entries.entries())
		.map(([key, value]) => {
			const quotedValue = value.includes(" ") ? `"${value}"` : value;
			return `${key}=${quotedValue}`;
		})
		.join("\n");

	writeFileSync(filePath, `${lines}\n`, "utf-8");
}

export function getDotenvValue(
	key: string,
	cwd = process.cwd(),
): string | undefined {
	if (process.env[key]) {
		return process.env[key];
	}

	const localPath = resolve(cwd, ".env.local");
	const localEntries = readDotenvFile(localPath);
	if (localEntries.has(key)) {
		return localEntries.get(key);
	}

	const envPath = resolve(cwd, ".env");
	const envEntries = readDotenvFile(envPath);
	return envEntries.get(key);
}

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

		if (!trimmed || trimmed.startsWith("#")) {
			return true;
		}

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
