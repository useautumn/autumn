import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	pinDependency,
	readMinimumReleaseAge,
	selectEligibleVersion,
} from "./pinAutumnJs";

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

const day = 24 * 60 * 60 * 1000;
const now = Date.parse("2026-10-06T14:00:00Z");
const ago = (ms: number) => new Date(now - ms).toISOString();

describe("eligible autumn-js version", () => {
	const select = (time: Record<string, string>) =>
		selectEligibleVersion({
			time,
			minimumReleaseAgeSeconds: 3 * 24 * 60 * 60,
			now,
		});

	test("skips a latest release younger than the minimum age and picks the newest old enough", () => {
		expect(
			select({
				created: ago(400 * day),
				modified: ago(1000),
				"1.3.49": ago(5 * day),
				"1.3.50": ago(3 * day + 1000),
				"1.3.51": ago(3 * day - 1000),
				"1.3.58": ago(1000),
			}),
		).toBe("1.3.50");
	});

	test("orders by semver, not by publish time or key order", () => {
		expect(
			select({
				"1.3.10": ago(10 * day),
				"1.3.9": ago(4 * day),
				"1.2.99": ago(3.5 * day),
			}),
		).toBe("1.3.10");
	});

	test("ignores prereleases", () => {
		expect(
			select({ "1.3.50": ago(5 * day), "1.4.0-beta.1": ago(4 * day) }),
		).toBe("1.3.50");
	});

	test("returns undefined when nothing is old enough", () => {
		expect(select({ "1.3.58": ago(day) })).toBeUndefined();
	});
});

describe("minimum release age", () => {
	test("reads [install] minimumReleaseAge from bunfig", () => {
		expect(
			readMinimumReleaseAge({
				bunfigText:
					'[test]\ntimeout = 0\n\n[install]\nminimumReleaseAge = 600 # seconds\nminimumReleaseAgeExcludes = ["x"]\n',
			}),
		).toBe(600);
	});

	test("refuses a bunfig without it", () => {
		expect(() => readMinimumReleaseAge({ bunfigText: "[install]\n" })).toThrow(
			"minimumReleaseAge",
		);
	});

	test("the repo bunfig keeps the gate on for autumn-js", async () => {
		const bunfigText = await Bun.file(join(root, "bunfig.toml")).text();
		expect(readMinimumReleaseAge({ bunfigText })).toBeGreaterThan(0);
		const excludes = Bun.TOML.parse(bunfigText) as {
			install: { minimumReleaseAgeExcludes?: string[] };
		};
		expect(excludes.install.minimumReleaseAgeExcludes ?? []).not.toContain(
			"autumn-js",
		);
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
