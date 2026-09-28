import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { createTestFileResolver } from "./createTestFileResolver";

const roots: string[] = [];
afterEach(async () => {
	await Promise.all(
		roots.splice(0).map((path) => rm(path, { recursive: true, force: true })),
	);
});

const createFixture = async () => {
	const rootDir = await mkdtemp(join(tmpdir(), "tw-discovery-"));
	roots.push(rootDir);
	for (const path of [
		"integration/billing/attach.test.ts",
		"integration/billing/helper.ts",
		"integration/billing-extra/other.test.ts",
		"billing/exact.test.ts",
	]) {
		await mkdir(dirname(join(rootDir, path)), { recursive: true });
		await writeFile(join(rootDir, path), "");
	}
	return rootDir;
};

test("exact paths take precedence over suffix matches and keep directory boundaries", async () => {
	const rootDir = await createFixture();
	const resolver = await createTestFileResolver({ rootDir });
	expect(resolver.resolvePath({ path: "billing" })).toEqual([
		join(rootDir, "billing/exact.test.ts"),
	]);
	expect(resolver.resolvePath({ path: "integration/billing/" })).toEqual([
		join(rootDir, "integration/billing/attach.test.ts"),
	]);
	expect(
		resolver.resolvePath({ path: "integration/billing/attach.test.ts" }),
	).toEqual([join(rootDir, "integration/billing/attach.test.ts")]);
});

test("file and directory suffixes resolve to the same tests as full paths", async () => {
	const rootDir = await createFixture();
	const resolver = await createTestFileResolver({ rootDir });
	expect(resolver.resolvePath({ path: "billing/attach.test.ts" })).toEqual(
		resolver.resolvePath({ path: "integration/billing/attach.test.ts" }),
	);
	expect(resolver.resolvePath({ path: "billing-extra" })).toEqual([
		join(rootDir, "integration/billing-extra/other.test.ts"),
	]);
	expect(resolver.resolvePath({ path: "missing" })).toEqual([]);
	expect(resolver.resolvePath({ path: basename(rootDir) })).toEqual([]);
	expect(
		resolver.resolvePath({ path: "integration/billing/helper.ts" }),
	).toEqual([]);
});

test("discovery follows file and directory links without treating helpers as tests", async () => {
	const rootDir = await createFixture();
	await symlink(join(rootDir, "billing"), join(rootDir, "linked"));
	await symlink(
		join(rootDir, "billing/exact.test.ts"),
		join(rootDir, "linked.test.ts"),
	);
	const resolver = await createTestFileResolver({ rootDir });
	expect(resolver.resolvePath({ path: "linked" })).toEqual([
		join(rootDir, "linked/exact.test.ts"),
	]);
	expect(resolver.resolvePath({ path: "linked.test.ts" })).toEqual([
		join(rootDir, "linked.test.ts"),
	]);
});

test("one run reuses its discovery snapshot and the next run discovers new files", async () => {
	const rootDir = await createFixture();
	const resolver = await createTestFileResolver({ rootDir });
	await writeFile(join(rootDir, "new.test.ts"), "");
	expect(resolver.resolvePath({ path: "new.test.ts" })).toEqual([]);
	const nextRun = await createTestFileResolver({ rootDir });
	expect(nextRun.resolvePath({ path: "new.test.ts" })).toEqual([
		join(rootDir, "new.test.ts"),
	]);
});
