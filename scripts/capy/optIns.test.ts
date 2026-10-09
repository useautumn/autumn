import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyOptInFlags, capyDevServices, withheldEnvKeys } from "./optIns.ts";

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

	test("the default stack is server-only: no vite, trigger, eve, checkout or atom", () => {
		expect(capyDevServices({ dir: createDir() })).toEqual([
			"server",
			"workers",
			"cron",
			"balance-worker",
			"stripe",
		]);
	});

	test("--frontend adds vite and --no-frontend removes it", () => {
		const dir = createDir();
		applyOptInFlags({ args: ["--frontend"], dir });
		expect(capyDevServices({ dir })).toContain("vite");
		applyOptInFlags({ args: ["--no-frontend"], dir });
		expect(capyDevServices({ dir })).not.toContain("vite");
	});

	test("--trigger and --eve add their dev services", () => {
		const dir = createDir();
		applyOptInFlags({ args: ["--trigger", "--eve"], dir });
		expect(capyDevServices({ dir })).toEqual(
			expect.arrayContaining(["trigger", "eve", "leaf"]),
		);
		expect(capyDevServices({ dir })).not.toContain("checkout");
	});

	test("serverOnly keeps backend services and opt-ins but drops every frontend", () => {
		const dir = createDir();
		applyOptInFlags({
			args: ["--frontend", "--trigger", "--eve", "--checkout"],
			dir,
		});
		const services = capyDevServices({ dir, serverOnly: true });
		expect(services).toEqual(
			expect.arrayContaining([
				"server",
				"workers",
				"cron",
				"balance-worker",
				"stripe",
				"trigger",
				"eve",
			]),
		);
		for (const frontend of ["vite", "checkout", "leaf"]) {
			expect(services).not.toContain(frontend);
		}
	});
});
