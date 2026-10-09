import { afterEach, describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	capyHandoffText,
	capyUnsetCommand,
	descendantPids,
	ensureCapyBashrc,
	stackRunsServices,
} from "./command.ts";

describe("ensureCapyBashrc", () => {
	const homes: string[] = [];
	function createHome() {
		const home = mkdtempSync(join(tmpdir(), "capy-bashrc-"));
		homes.push(home);
		return home;
	}
	afterEach(() => {
		for (const home of homes.splice(0)) rmSync(home, { recursive: true });
	});

	test("leaves shells untouched without an existing Capy machine config", () => {
		const home = createHome();
		for (const machineConfig of ["", join(home, "missing.json")]) {
			ensureCapyBashrc({ home, machineConfig });
			expect(existsSync(join(home, ".bashrc"))).toBe(false);
		}
	});

	test("preserves existing shell config and appends the directory once", () => {
		const home = createHome();
		const machineConfig = join(home, "machine.json");
		writeFileSync(machineConfig, "{}");
		const bashrc = join(home, ".bashrc");
		writeFileSync(bashrc, "export EDITOR=vim");
		ensureCapyBashrc({ home, machineConfig });
		ensureCapyBashrc({ home, machineConfig });
		expect(readFileSync(bashrc, "utf-8")).toBe(
			"export EDITOR=vim\ncd /workspace/autumn\n",
		);
	});

	test("creates a missing bashrc on a Capy machine", () => {
		const home = createHome();
		const machineConfig = join(home, "machine.json");
		writeFileSync(machineConfig, "{}");
		ensureCapyBashrc({ home, machineConfig });
		expect(readFileSync(join(home, ".bashrc"), "utf-8").trim()).toBe(
			"cd /workspace/autumn",
		);
	});
});

describe("capyHandoffText", () => {
	test("defaults to the server stack and names the frontend opt-in", () => {
		const text = capyHandoffText();
		expect(text).toContain("tmux session: capy");
		expect(text).toContain("no dashboard");
		expect(text).toContain("bun capy restart --frontend");
		expect(text).not.toContain("expose only port 3000");
	});

	test("describes the dashboard handoff when the frontend is on", () => {
		const text = capyHandoffText({ frontend: true });
		expect(text).toContain("browser API uses /__autumn_api");
		expect(text).toContain("expose only port 3000");
	});
});

describe("capyUnsetCommand", () => {
	test("unsets withheld keys after the login shell re-exports them", () => {
		expect(capyUnsetCommand(["ALIEN_API_KEY"])).toBe("unset ALIEN_API_KEY; ");
	});

	test("adds nothing when every opt-in is on", () => {
		expect(capyUnsetCommand([])).toBe("");
	});
});

describe("descendantPids", () => {
	test("follows the whole tree under the tmux panes, including nodemon's children", () => {
		const psOutput = [
			"  1     0",
			" 10     1",
			" 11    10",
			" 12    11",
			" 20     1",
		].join("\n");
		expect(descendantPids({ roots: [10], psOutput }).sort()).toEqual([
			10, 11, 12,
		]);
	});
});

describe("stackRunsServices", () => {
	test("a --server-only stack doesn't satisfy a later run that wants checkout", () => {
		expect(
			stackRunsServices({
				running: "server,workers,stripe\n",
				requested: ["server", "workers", "stripe", "checkout"],
			}),
		).toBe(false);
	});

	test("a running superset satisfies --server-only", () => {
		expect(
			stackRunsServices({
				running: "server,vite,checkout\n",
				requested: ["server"],
			}),
		).toBe(true);
	});

	test("an unknown running stack satisfies nothing", () => {
		expect(
			stackRunsServices({ running: undefined, requested: ["server"] }),
		).toBe(false);
	});
});
