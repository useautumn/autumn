/** Regenerates web/src/mock/catalogFixture.json from the real server/tests/_groups. */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { createTestFileResolver } from "../../../../scripts/tw/testDiscovery/createTestFileResolver.ts";
import {
	discoverAllTestFiles,
	getAllGroups,
	getAllSuites,
} from "../../../../server/tests/_groups/index.ts";

const testsDir = path.resolve(import.meta.dir, "../../../../server/tests");
const everyFile = await discoverAllTestFiles({ testsDir });
const resolver = await createTestFileResolver({ rootDir: testsDir });
const expand = (p: string) =>
	resolver.resolvePath({ path: p }).map((f) => path.relative(testsDir, f));

const groups = getAllGroups()
	.filter((g) => g.name !== "all" && g.name !== "temp")
	.map((g) => ({
		name: g.name,
		tier: g.tier,
		description: g.description,
		files: [...new Set(g.paths.flatMap(expand))].filter((f) =>
			everyFile.includes(f),
		),
	}));
const suites = getAllSuites().map((s) => ({
	name: s.name,
	description: s.description,
	groups: s.groups,
}));

const covered = new Set(groups.flatMap((g) => g.files));
await writeFile(
	path.resolve(import.meta.dir, "../src/mock/catalogFixture.json"),
	`${JSON.stringify({ groups, suites, files: [...covered].sort() })}\n`,
);
console.log(`${groups.length} groups, ${covered.size} files`);
