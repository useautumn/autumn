import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type PublishedPackage, planPublish } from "./planPublish";

const repos: string[] = [];
afterEach(() => {
	for (const repo of repos.splice(0)) rmSync(repo, { recursive: true });
});

const git = (root: string, ...args: string[]) => {
	const result = Bun.spawnSync(["git", ...args], { cwd: root });
	if (result.exitCode !== 0) throw new Error(result.stderr.toString());
	return result.stdout.toString().trim();
};

const write = (root: string, path: string, text: string) =>
	Bun.write(join(root, path), text);

const manifest = (name: string, version: string) =>
	`{\n\t"name": "${name}",\n\t"version": "${version}",\n\t"private": false\n}\n`;

const packages: PublishedPackage[] = [
	{
		name: "autumn-js",
		dir: "packages/autumn-js",
		tagPrefix: "autumn-js",
		sourcePaths: ["packages/autumn-js", "packages/sdk", "shared"],
	},
	{
		name: "@useautumn/gateway",
		dir: "packages/gateway",
		tagPrefix: "gateway",
		sourcePaths: ["packages/gateway"],
	},
];

const createRepo = async () => {
	const root = mkdtempSync(join(tmpdir(), "plan-publish-"));
	repos.push(root);
	git(root, "init", "-q", "-b", "main");
	git(root, "config", "user.email", "test@example.com");
	git(root, "config", "user.name", "test");
	await write(
		root,
		"packages/autumn-js/package.json",
		manifest("autumn-js", "1.3.56"),
	);
	await write(root, "packages/sdk/src/index.ts", "export {};\n");
	await write(
		root,
		"packages/gateway/package.json",
		manifest("@useautumn/gateway", "0.1.18"),
	);
	await write(root, "shared/index.ts", "export {};\n");
	git(root, "add", "-A");
	git(root, "commit", "-q", "-m", "initial");
	git(root, "tag", "autumn-js-v1.3.9");
	git(root, "tag", "autumn-js-v1.3.56");
	git(root, "tag", "gateway-v0.1.18");
	return root;
};

const npm =
	(published: Record<string, string[]>) =>
	async (url: string): Promise<Response> => {
		const name = decodeURIComponent(url.split("/").pop() ?? "");
		const versions = published[name];
		if (!versions)
			return Response.json({ error: "Not found" }, { status: 404 });
		return Response.json({
			versions: Object.fromEntries(versions.map((version) => [version, {}])),
		});
	};

const plan = (root: string, options: { force?: string[] } = {}) =>
	planPublish({
		ctx: {
			fetch: npm({
				"autumn-js": ["1.3.55", "1.3.56"],
				"@useautumn/gateway": ["0.1.18"],
			}),
		},
		root,
		packages,
		commitSha: "a".repeat(40),
		force: options.force ?? [],
		dryRun: false,
	});

describe("publish plan", () => {
	test("publishes nothing when no package source changed since its last tag", async () => {
		const root = await createRepo();
		expect(await plan(root)).toEqual([]);
	});

	test("publishes a package whose regenerated source differs from its last tag", async () => {
		const root = await createRepo();
		await write(root, "packages/sdk/src/index.ts", "export const x = 1;\n");
		expect(await plan(root)).toEqual([
			{
				name: "autumn-js",
				dir: "packages/autumn-js",
				tagPrefix: "autumn-js",
				version: "1.3.57",
			},
		]);
	});

	test("counts new untracked files under a source path as a change", async () => {
		const root = await createRepo();
		await write(root, "shared/newSchema.ts", "export {};\n");
		expect((await plan(root)).map((pkg) => pkg.name)).toEqual(["autumn-js"]);
	});

	test("compares against the highest semver tag, not the newest string", async () => {
		const root = await createRepo();
		git(root, "tag", "-d", "autumn-js-v1.3.56");
		await write(root, "packages/sdk/src/index.ts", "export const x = 1;\n");
		git(root, "commit", "-qam", "change after 1.3.9");
		git(root, "tag", "autumn-js-v1.3.56");
		expect(await plan(root)).toEqual([]);
	});

	test("publishes a package that has never been tagged", async () => {
		const root = await createRepo();
		git(root, "tag", "-d", "gateway-v0.1.18");
		expect((await plan(root)).map((pkg) => pkg.version)).toEqual(["0.1.19"]);
	});

	test("publishes forced packages even without changes", async () => {
		const root = await createRepo();
		expect(
			(await plan(root, { force: ["@useautumn/gateway"] })).map(
				(pkg) => pkg.name,
			),
		).toEqual(["@useautumn/gateway"]);
	});

	test("rejects an unknown forced package", async () => {
		const root = await createRepo();
		await expect(plan(root, { force: ["nope"] })).rejects.toThrow("nope");
	});

	test("writes the next version into the manifest and leaves other fields untouched", async () => {
		const root = await createRepo();
		await write(root, "packages/gateway/src/index.ts", "export {};\n");
		await plan(root);
		expect(
			await Bun.file(join(root, "packages/gateway/package.json")).text(),
		).toBe(manifest("@useautumn/gateway", "0.1.19"));
		expect(
			await Bun.file(join(root, "packages/autumn-js/package.json")).text(),
		).toBe(manifest("autumn-js", "1.3.56"));
	});
});
