import { afterEach, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { ignoreBundledSkills } from "../src/actions/skills/ignoreBundledSkills";

const dirs: string[] = [];
const repo = () => {
	const dir = mkdtempSync(join(tmpdir(), "atmn-ignore-"));
	dirs.push(dir);
	return dir;
};

afterEach(() => {
	for (const dir of dirs.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

test.each(["autumn", "packages/billing", ".", "custom [folder]*? name"])(
	"ignores only config-adjacent skills in %s",
	(folder) => {
		const repoRoot = repo();
		const configDir = resolve(repoRoot, folder);
		mkdirSync(join(configDir, "skills"), { recursive: true });
		expect(spawnSync("git", ["init", "-q"], { cwd: repoRoot }).status).toBe(0);
		ignoreBundledSkills({ repoRoot, configDir });
		const ignored = spawnSync("git", ["check-ignore", "--stdin"], {
			cwd: repoRoot,
			encoding: "utf8",
			input: [
				join(configDir, "skills", "SKILL.md"),
				join(configDir, "autumn.config.ts"),
				join(repoRoot, ".agents/skills/SKILL.md"),
				join(repoRoot, "other/skills/SKILL.md"),
			].join("\n"),
		});
		expect(ignored.stdout.trim()).toBe(join(configDir, "skills", "SKILL.md"));
	},
);

test.each(["", "node_modules/", "node_modules/\n", "node_modules/\r\n"])(
	"preserves existing contents and does not duplicate entries: %j",
	(contents) => {
		const repoRoot = repo();
		const ignorePath = join(repoRoot, ".gitignore");
		writeFileSync(ignorePath, contents);
		ignoreBundledSkills({
			repoRoot,
			configDir: join(repoRoot, "packages/custom"),
		});
		const first = readFileSync(ignorePath, "utf8");
		expect(first.startsWith(contents)).toBe(true);
		expect(first.split(/\r?\n/)).toContain("/packages/custom/skills/");
		ignoreBundledSkills({
			repoRoot,
			configDir: join(repoRoot, "packages/custom"),
		});
		expect(readFileSync(ignorePath, "utf8")).toBe(first);
	},
);

test("does not add paths outside the repository", () => {
	const repoRoot = repo();
	ignoreBundledSkills({ repoRoot, configDir: repo() });
	expect(existsSync(join(repoRoot, ".gitignore"))).toBe(false);
});

test.each(["install", "update"])(
	"skills %s ignores the default folder but not a custom destination",
	(command) => {
		const repoRoot = repo();
		const configDir = join(repoRoot, "packages/custom");
		mkdirSync(configDir, { recursive: true });
		writeFileSync(join(configDir, "autumn.config.ts"), "export default {};");
		writeFileSync(
			join(repoRoot, "package.json"),
			JSON.stringify({
				atmn: { config: "packages/custom/autumn.config.ts" },
			}),
		);
		const cli = resolve(import.meta.dir, "../src/cli.ts");
		const run = (args: string[]) =>
			spawnSync(process.execPath, [cli, "skills", command, ...args], {
				cwd: repoRoot,
				encoding: "utf8",
			});
		expect(run(["--dir", ".agents/skills"]).status).toBe(0);
		expect(existsSync(join(repoRoot, ".gitignore"))).toBe(false);
		const result = run([]);
		expect(result.stderr).toBe("");
		expect(result.status).toBe(0);
		expect(readFileSync(join(repoRoot, ".gitignore"), "utf8")).toBe(
			"/packages/custom/skills/\n",
		);
	},
);
