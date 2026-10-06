import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { keepPublishedVersions } from "./keepPublishedVersions";

const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true });
});

const manifest = (name: string, version: string) =>
	`{\n\t"name": "${name}",\n\t"version": "${version}",\n\t"private": false\n}\n`;

const lock = (versions: Record<string, string>) =>
	`{\n  "workspaces": {\n${Object.entries(versions)
		.map(
			([dir, version]) =>
				`    "${dir}": {\n      "name": "${dir.split("/")[1]}",\n      "version": "${version}",\n    },\n`,
		)
		.join("")}  },\n}\n`;

const planned = [
	{
		name: "autumn-js",
		dir: "packages/autumn-js",
		tagPrefix: "autumn-js",
		version: "1.3.59",
	},
	{ name: "atmn", dir: "packages/atmn", tagPrefix: "atmn", version: "2.0.78" },
	{
		name: "@useautumn/gateway",
		dir: "packages/gateway",
		tagPrefix: "gateway",
		version: "0.1.21",
	},
];

// The regenerated tree as the publish patch leaves it: every planned package bumped.
const createTree = async () => {
	const root = mkdtempSync(join(tmpdir(), "keep-published-"));
	dirs.push(root);
	await Bun.write(
		join(root, "packages/autumn-js/package.json"),
		manifest("autumn-js", "1.3.59"),
	);
	await Bun.write(
		join(root, "packages/atmn/package.json"),
		manifest("atmn", "2.0.78"),
	);
	await Bun.write(
		join(root, "packages/gateway/package.json"),
		manifest("@useautumn/gateway", "0.1.21"),
	);
	await Bun.write(
		join(root, "bun.lock"),
		lock({
			"packages/atmn": "2.0.78",
			"packages/autumn-js": "1.3.59",
			"packages/gateway": "0.1.21",
		}),
	);
	return root;
};

const previous = {
	"packages/autumn-js": "1.3.58",
	"packages/atmn": "2.0.77",
	"packages/gateway": "0.1.20",
};

describe("keep published versions", () => {
	test("reverts the manifest and lockfile versions of packages that failed to publish", async () => {
		const root = await createTree();
		const kept = await keepPublishedVersions({
			root,
			planned,
			published: ["autumn-js", "gateway"],
			previousVersions: previous,
		});

		expect(kept.map((pkg) => pkg.name)).toEqual([
			"autumn-js",
			"@useautumn/gateway",
		]);
		expect(
			await Bun.file(join(root, "packages/atmn/package.json")).text(),
		).toBe(manifest("atmn", "2.0.77"));
		expect(
			await Bun.file(join(root, "packages/autumn-js/package.json")).text(),
		).toBe(manifest("autumn-js", "1.3.59"));
		expect(await Bun.file(join(root, "bun.lock")).text()).toBe(
			lock({
				"packages/atmn": "2.0.77",
				"packages/autumn-js": "1.3.59",
				"packages/gateway": "0.1.21",
			}),
		);
	});

	test("keeps everything when every package published", async () => {
		const root = await createTree();
		const kept = await keepPublishedVersions({
			root,
			planned,
			published: ["autumn-js", "atmn", "gateway"],
			previousVersions: previous,
		});
		expect(kept).toEqual(planned);
		expect(
			await Bun.file(join(root, "packages/atmn/package.json")).text(),
		).toBe(manifest("atmn", "2.0.78"));
	});

	test("reverts every bump when nothing published", async () => {
		const root = await createTree();
		const kept = await keepPublishedVersions({
			root,
			planned,
			published: [],
			previousVersions: previous,
		});
		expect(kept).toEqual([]);
		expect(await Bun.file(join(root, "bun.lock")).text()).toBe(
			lock({
				"packages/atmn": "2.0.77",
				"packages/autumn-js": "1.3.58",
				"packages/gateway": "0.1.20",
			}),
		);
	});
});
