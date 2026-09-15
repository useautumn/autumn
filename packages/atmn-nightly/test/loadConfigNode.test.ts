/**
 * Under node the config is imported through jiti. The hook must resolve from
 * this package, not from the config's folder: a user's project has no jiti.
 */

import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { importConfigArgs } from "../src/config/loadConfig";

test("the node loader pins this package's jiti register hook", () => {
	const args = importConfigArgs({
		path: "/nowhere/autumn.config.ts",
		onBun: false,
	});
	expect(args.slice(0, 2)).toEqual(["--no-deprecation", "--import"]);
	const hook = args[2] ?? "";
	expect(hook).toStartWith("file://");
	expect(fileURLToPath(hook)).toContain("/node_modules/jiti/");
	expect(existsSync(fileURLToPath(hook))).toBe(true);
});

test("node imports a .ts config from a folder with no jiti installed", () => {
	const which = spawnSync("node", ["--version"], { encoding: "utf8" });
	if (which.status !== 0) return; // no node on this machine; the bun path is covered elsewhere
	const dir = mkdtempSync(join(tmpdir(), "atmn-node-load-"));
	try {
		const path = join(dir, "autumn.config.ts");
		writeFileSync(
			path,
			"const answer: number = 42;\nexport default { answer };\n",
		);
		const result = spawnSync("node", importConfigArgs({ path, onBun: false }), {
			cwd: dir,
			encoding: "utf8",
		});
		expect(result.stderr).toBe("");
		expect(JSON.parse(result.stdout)).toEqual({
			ok: true,
			module: { default: { answer: 42 } },
		});
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
