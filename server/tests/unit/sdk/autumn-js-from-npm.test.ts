import { describe, expect, test } from "bun:test";
import { autumnHandler } from "autumn-js/hono";
import serverPackageJson from "../../../package.json";

const resolveFromServer = (specifier: string) =>
	Bun.resolveSync(specifier, `${import.meta.dir}/../../../src`);

describe("autumn-js comes from npm", () => {
	test("autumn-js and autumn-js/hono resolve to the installed npm package", () => {
		for (const specifier of ["autumn-js", "autumn-js/hono"]) {
			const resolved = resolveFromServer(specifier);
			expect(resolved).toContain("/node_modules/");
			expect(resolved).not.toContain("/packages/autumn-js/src/");
		}
	});

	test("installed version is the exact pin in server/package.json", async () => {
		const pinned = serverPackageJson.dependencies["autumn-js"];
		const installed = await Bun.file(
			resolveFromServer("autumn-js/package.json"),
		).json();

		expect(pinned).toMatch(/^\d+\.\d+\.\d+$/);
		expect(installed.version).toBe(pinned);
	});

	test("autumnHandler is exported from the hono adapter", () => {
		expect(typeof autumnHandler).toBe("function");
	});
});
