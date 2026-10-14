import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { importConfigArgs } from "../src/config/loadConfig";

test("the node loader imports through this package's jiti, not the config's folder", () => {
	const args = importConfigArgs({
		path: "/nowhere/autumn.config.ts",
		onBun: false,
	});
	expect(args[0]).toBe("-e");
	const script = args[1] ?? "";
	const jitiUrl = /import\("(file:[^"]+)"\)/.exec(script)?.[1] ?? "";
	expect(fileURLToPath(jitiUrl)).toContain("/node_modules/jiti/");
	expect(existsSync(fileURLToPath(jitiUrl))).toBe(true);
	expect(script).toContain("createJiti");
});

test("node imports a .ts config from a folder with no jiti installed", () => {
	const which = spawnSync("node", ["--version"], { encoding: "utf8" });
	if (which.status !== 0) return;
	const dir = mkdtempSync(join(tmpdir(), "atmn-node-load-"));
	try {
		const path = join(dir, "autumn.config.ts");
		writeFileSync(
			path,
			'const answer: number = 42;\nexport const named = "kept";\nexport default { answer };\n',
		);
		const result = spawnSync("node", importConfigArgs({ path, onBun: false }), {
			cwd: dir,
			encoding: "utf8",
		});
		expect(result.stderr).toBe("");
		expect(JSON.parse(result.stdout)).toEqual({
			ok: true,
			module: { named: "kept", default: { answer: 42 } },
		});
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
