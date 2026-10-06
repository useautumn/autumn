import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pinDependency } from "./pinAutumnJs";

const root = join(import.meta.dir, "../..");

const manifest = (pin: string) =>
	`{\n\t"name": "@autumn/server",\n\t"dependencies": {\n\t\t"ai": "6.0.0",\n\t\t"autumn-js": "${pin}",\n\t\t"zod": "^4.0.0"\n\t}\n}\n`;

describe("pin autumn-js", () => {
	test("replaces the exact pin and keeps the rest of the manifest byte-for-byte", () => {
		expect(
			pinDependency({
				manifestText: manifest("1.3.55"),
				name: "autumn-js",
				version: "1.3.57",
			}),
		).toBe(manifest("1.3.57"));
	});

	test("is a no-op when already pinned", () => {
		expect(
			pinDependency({
				manifestText: manifest("1.3.57"),
				name: "autumn-js",
				version: "1.3.57",
			}),
		).toBe(manifest("1.3.57"));
	});

	test("refuses a manifest without the dependency", () => {
		expect(() =>
			pinDependency({
				manifestText: '{\n\t"dependencies": {}\n}\n',
				name: "autumn-js",
				version: "1.3.57",
			}),
		).toThrow("autumn-js");
	});

	test("refuses a version that is not an exact stable release", () => {
		expect(() =>
			pinDependency({
				manifestText: manifest("1.3.55"),
				name: "autumn-js",
				version: "^1.3.57",
			}),
		).toThrow("^1.3.57");
	});
});

describe("repo install settings", () => {
	const dirs: string[] = [];
	afterEach(() => {
		for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true });
	});

	// On main the autumn-js workspace carries the same version as the pin; it must still come from npm.
	test("an exact pin equal to a workspace's version installs from npm", async () => {
		const bunfig = await Bun.file(join(root, "bunfig.toml")).text();
		const installSection = bunfig.slice(bunfig.indexOf("[install]"));
		const dir = mkdtempSync(join(tmpdir(), "pin-resolution-"));
		dirs.push(dir);
		await Bun.write(join(dir, "bunfig.toml"), installSection);
		await Bun.write(
			join(dir, "package.json"),
			JSON.stringify({ private: true, workspaces: ["packages/*", "app"] }),
		);
		await Bun.write(
			join(dir, "packages/is-number/package.json"),
			JSON.stringify({ name: "is-number", version: "7.0.0" }),
		);
		await Bun.write(
			join(dir, "app/package.json"),
			JSON.stringify({ name: "app", dependencies: { "is-number": "7.0.0" } }),
		);

		const install = Bun.spawnSync(["bun", "install"], { cwd: dir });
		expect(install.exitCode).toBe(0);
		expect(realpathSync(join(dir, "app/node_modules/is-number"))).toContain(
			"/node_modules/.bun/is-number@7.0.0/",
		);
	}, 60_000);
});
