/**
 * Runs in a throwaway child with an empty env: imports a commit's untrusted `_groups` and
 * prints its groups, suites and every name's resolved paths as JSON on stdout.
 */
import { join } from "node:path";

const testsDir = process.argv[2];
if (!testsDir) throw new Error("usage: dumpTestGroups.ts <testsDir>");

const { getAllGroups, getAllSuites, resolveTestPaths } = await import(
	join(testsDir, "_groups", "index.ts")
);
if (!getAllGroups || !getAllSuites || !resolveTestPaths) {
	process.stdout.write(JSON.stringify({ unsupported: true }));
	process.exit(0);
}
const groups = getAllGroups();
const suites = getAllSuites();
const resolved = Object.fromEntries(
	[...groups, ...suites].map(({ name }: { name: string }) => [
		name,
		resolveTestPaths({ name }) ?? null,
	]),
);
process.stdout.write(JSON.stringify({ groups, suites, resolved }));
