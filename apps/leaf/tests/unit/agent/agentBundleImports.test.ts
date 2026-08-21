import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";

const LEAF_ROOT = resolve(import.meta.dir, "../../..");

/** Externals that must never enter the eve agent bundle: they are transitive
 * workspace deps the deployed image cannot resolve from the authored-modules
 * cache, so a single import breaks leaf boot in production. */
const FORBIDDEN_EXTERNALS = ["@autumn/logging", "pino", "@axiomhq/pino"];

const tsFilesUnder = (dir: string): string[] =>
	readdirSync(dir).flatMap((entry) => {
		const path = resolve(dir, entry);
		if (statSync(path).isDirectory()) return tsFilesUnder(path);
		return path.endsWith(".ts") ? [path] : [];
	});

const resolveRelative = (fromFile: string, specifier: string) => {
	const target = resolve(dirname(fromFile), specifier);
	for (const candidate of [
		target.replace(/\.js$/, ".ts"),
		`${target}.ts`,
		resolve(target, "index.ts"),
	]) {
		try {
			statSync(candidate);
			return candidate;
		} catch {}
	}
	return null;
};

describe("agent bundle import closure", () => {
	test("never reaches server-only logging deps", () => {
		const queue = tsFilesUnder(resolve(LEAF_ROOT, "agent"));
		const seen = new Set<string>();
		const offenders: string[] = [];
		while (queue.length) {
			const file = queue.pop() as string;
			if (seen.has(file)) continue;
			seen.add(file);
			const source = readFileSync(file, "utf8");
			for (const match of source.matchAll(/from "([^"]+)"/g)) {
				const specifier = match[1];
				if (specifier.startsWith(".")) {
					const resolved = resolveRelative(file, specifier);
					if (resolved) queue.push(resolved);
					continue;
				}
				if (
					FORBIDDEN_EXTERNALS.some(
						(name) => specifier === name || specifier.startsWith(`${name}/`),
					)
				) {
					offenders.push(`${file.slice(LEAF_ROOT.length + 1)} -> ${specifier}`);
				}
			}
		}
		expect(seen.size).toBeGreaterThan(30);
		expect(offenders).toEqual([]);
	});
});
