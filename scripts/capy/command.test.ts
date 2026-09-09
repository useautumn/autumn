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
import { capyHandoffText, ensureCapyBashrc } from "./command.ts";

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
	test("describes the bounded Capy handoff", () => {
		const text = capyHandoffText();
		expect(text).toContain("tmux session: capy");
		expect(text).toContain("browser API uses /__autumn_api");
		expect(text).toContain("expose only port 3000");
	});
});
