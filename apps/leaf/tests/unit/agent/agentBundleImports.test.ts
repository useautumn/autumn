import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";

const LEAF_ROOT = resolve(import.meta.dir, "../../..");

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

const packageNameOf = (specifier: string) =>
	specifier.startsWith("@")
		? specifier.split("/").slice(0, 2).join("/")
		: specifier.split("/")[0];

/** The eve agent bundle resolves imports from a cache path where only leaf's
 * OWN dependencies are guaranteed present — a transitive workspace dep (pino
 * via @autumn/logging broke prod boot) resolves only by image-layout luck. */
describe("agent bundle import closure", () => {
	test("every runtime external is a declared leaf dependency", () => {
		const manifest = JSON.parse(
			readFileSync(resolve(LEAF_ROOT, "package.json"), "utf8"),
		) as { dependencies?: Record<string, string> };
		const declared = new Set(Object.keys(manifest.dependencies ?? {}));
		const queue = tsFilesUnder(resolve(LEAF_ROOT, "agent"));
		const seen = new Set<string>();
		const offenders = new Set<string>();
		while (queue.length) {
			const file = queue.pop() as string;
			if (seen.has(file)) continue;
			seen.add(file);
			const source = readFileSync(file, "utf8");
			for (const match of source.matchAll(
				/import\s+(type\s+)?[^;]*?from\s+"([^"]+)"/g,
			)) {
				const [, typeOnly, specifier] = match;
				if (typeOnly) continue;
				if (specifier.startsWith(".")) {
					const resolved = resolveRelative(file, specifier);
					if (resolved) queue.push(resolved);
					continue;
				}
				if (specifier.startsWith("node:")) continue;
				const packageName = packageNameOf(specifier);
				if (!declared.has(packageName)) {
					offenders.add(
						`${file.slice(LEAF_ROOT.length + 1)} -> ${packageName}`,
					);
				}
			}
		}
		expect(seen.size).toBeGreaterThan(30);
		expect([...offenders].sort()).toEqual([]);
	});
});
