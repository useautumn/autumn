import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyOptInFlags, withheldEnvKeys } from "./optIns.ts";

describe("capy opt-ins", () => {
	const dirs: string[] = [];
	function createDir() {
		const dir = join(mkdtempSync(join(tmpdir(), "capy-opt-ins-")), "opt-ins");
		dirs.push(dir);
		return dir;
	}
	afterEach(() => {
		for (const dir of dirs.splice(0))
			rmSync(join(dir, ".."), { recursive: true });
	});

	test("withholds the alien key until the stack opts in", () => {
		const dir = createDir();
		expect(withheldEnvKeys({ dir })).toEqual(["ALIEN_API_KEY"]);
	});

	test("--alien persists, so a plain `bun capy` after reboot keeps alien", () => {
		const dir = createDir();
		expect(applyOptInFlags({ args: ["--alien"], dir })).toBe(true);
		expect(existsSync(join(dir, "alien"))).toBe(true);

		expect(applyOptInFlags({ args: [], dir })).toBe(false);
		expect(withheldEnvKeys({ dir })).toEqual([]);
	});

	test("--no-alien opts back out", () => {
		const dir = createDir();
		applyOptInFlags({ args: ["--alien"], dir });
		expect(applyOptInFlags({ args: ["--no-alien"], dir })).toBe(true);
		expect(withheldEnvKeys({ dir })).toEqual(["ALIEN_API_KEY"]);
	});

	test("repeating the current choice changes nothing", () => {
		const dir = createDir();
		expect(applyOptInFlags({ args: ["--no-alien"], dir })).toBe(false);
		applyOptInFlags({ args: ["--alien"], dir });
		expect(applyOptInFlags({ args: ["--alien"], dir })).toBe(false);
	});
});
