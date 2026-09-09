/**
 * Where a command's config and .env come from. The rule is flag → cwd → root
 * marker, and .env is read from the root first so one file serves every
 * package of a monorepo.
 */

import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	configPathFromFlag,
	resolveProject,
} from "../src/project/resolveProject";

const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

const makeRepo = ({ marker }: { marker?: string } = {}): string => {
	const root = mkdtempSync(join(tmpdir(), "atmn-project-"));
	dirs.push(root);
	mkdirSync(join(root, ".git"));
	writeFileSync(
		join(root, "package.json"),
		JSON.stringify({
			name: "repo",
			workspaces: ["packages/*"],
			...(marker === undefined ? {} : { atmn: { config: marker } }),
		}),
	);
	return root;
};

test("-c takes a file, a folder, or a folder that does not exist yet", () => {
	const root = makeRepo();
	mkdirSync(join(root, "packages/autumn"), { recursive: true });
	writeFileSync(join(root, "packages/autumn/autumn.config.ts"), "");

	expect(
		configPathFromFlag({ cwd: root, flag: "packages/autumn/autumn.config.ts" }),
	).toBe(join(root, "packages/autumn/autumn.config.ts"));
	expect(configPathFromFlag({ cwd: root, flag: "packages/autumn" })).toBe(
		join(root, "packages/autumn/autumn.config.ts"),
	);
	expect(configPathFromFlag({ cwd: root, flag: "packages/new" })).toBe(
		join(root, "packages/new/autumn.config.ts"),
	);
	mkdirSync(join(root, "packages/js"), { recursive: true });
	writeFileSync(join(root, "packages/js/autumn.config.js"), "");
	expect(configPathFromFlag({ cwd: root, flag: "packages/js" })).toBe(
		join(root, "packages/js/autumn.config.js"),
	);
});

test("a config beside cwd wins over the marker", () => {
	const root = makeRepo({ marker: "packages/autumn/autumn.config.ts" });
	const here = join(root, "packages/other");
	mkdirSync(here, { recursive: true });
	writeFileSync(join(here, "autumn.config.ts"), "");

	const project = resolveProject({ cwd: here });
	expect(project.source).toBe("cwd");
	expect(project.configPath).toBe(join(here, "autumn.config.ts"));
	expect(project.configDir).toBe(here);
});

test("from the repo root, the marker finds the package's config", () => {
	const root = makeRepo({ marker: "packages/autumn/autumn.config.ts" });
	mkdirSync(join(root, "packages/autumn"), { recursive: true });
	writeFileSync(join(root, "packages/autumn/autumn.config.ts"), "");

	const project = resolveProject({ cwd: root });
	expect(project.source).toBe("marker");
	expect(project.configPath).toBe(
		join(root, "packages/autumn/autumn.config.ts"),
	);
	expect(project.configDir).toBe(join(root, "packages/autumn"));
	expect(project.repoRoot).toBe(root);
});

test("the marker works from any folder under the root", () => {
	const root = makeRepo({ marker: "packages/autumn/autumn.config.ts" });
	const deep = join(root, "apps/web/src");
	mkdirSync(deep, { recursive: true });

	const project = resolveProject({ cwd: deep });
	expect(project.source).toBe("marker");
	expect(project.configDir).toBe(join(root, "packages/autumn"));
});

test("without a config anywhere, the project has none and points at cwd", () => {
	const root = makeRepo();
	const project = resolveProject({ cwd: root });
	expect(project.source).toBe("none");
	expect(project.configPath).toBeNull();
	expect(project.configDir).toBe(root);
});

test(".env is read from the root first, then the config folder", () => {
	const root = makeRepo({ marker: "packages/autumn/autumn.config.ts" });
	mkdirSync(join(root, "packages/autumn"), { recursive: true });
	writeFileSync(join(root, "packages/autumn/autumn.config.ts"), "");

	const project = resolveProject({ cwd: join(root, "packages/autumn") });
	expect(project.envDirs[0]).toBe(root);
	expect(project.envDirs).toContain(join(root, "packages/autumn"));
});
