import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getCurrentBranch } from "./git.ts";

describe("getCurrentBranch", () => {
	let repoPath: string;

	const git = (...args: string[]) => {
		const result = Bun.spawnSync(["git", ...args], {
			cwd: repoPath,
			stdout: "pipe",
			stderr: "pipe",
		});
		expect(result.exitCode).toBe(0);
	};

	beforeEach(() => {
		repoPath = mkdtempSync(join(tmpdir(), "autumn-dw-git-"));
		git("init", "--initial-branch=dev");
		writeFileSync(join(repoPath, "README.md"), "test\n");
		git("add", "README.md");
		git(
			"-c",
			"user.name=Autumn Test",
			"-c",
			"user.email=test@useautumn.com",
			"commit",
			"-m",
			"test",
		);
	});

	afterEach(() => {
		rmSync(repoPath, { recursive: true, force: true });
	});

	test("returns the checked-out branch", () => {
		expect(getCurrentBranch({ cwd: repoPath })).toBe("dev");
	});

	test("allows a detached HEAD", () => {
		git("checkout", "--detach");

		expect(getCurrentBranch({ cwd: repoPath })).toBeUndefined();
	});
});
