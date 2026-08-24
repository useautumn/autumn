import { describe, expect, test } from "bun:test";
import {
	isDwDevSupervisor,
	isDwOrphan,
	isDwRunCli,
	isIgnoredKillCommand,
	isUnderWorktree,
	selectDwPids,
} from "./killDwProcesses.ts";

const roots = ["/Users/me/.cursor/worktrees/default/0i2r"];

describe("isIgnoredKillCommand", () => {
	test("scanners and the kill command itself are ignored", () => {
		expect(isIgnoredKillCommand({ command: "rg scripts/dw/index.ts run" })).toBe(
			true,
		);
		expect(isIgnoredKillCommand({ command: "vim scripts/dw/index.ts" })).toBe(
			true,
		);
		expect(
			isIgnoredKillCommand({ command: "bun scripts/dw/index.ts kill" }),
		).toBe(true);
		expect(isIgnoredKillCommand({ command: "bun kill:dw" })).toBe(true);
		expect(
			isIgnoredKillCommand({
				command: "bun test scripts/dw/helpers/ports.test.ts",
			}),
		).toBe(true);
	});
});

describe("isDwRunCli", () => {
	test("only the run subcommand is a seed", () => {
		expect(
			isDwRunCli({ command: "bun scripts/dw/index.ts run" }),
		).toBe(true);
		expect(
			isDwRunCli({
				command:
					"infisical run --env=dev --recursive -- bun scripts/dw/index.ts run",
			}),
		).toBe(true);
		expect(isDwRunCli({ command: "ol bun dw run" })).toBe(true);
		expect(isDwRunCli({ command: "bun scripts/dw/index.ts list" })).toBe(
			false,
		);
		expect(isDwRunCli({ command: "bun scripts/dw/index.ts teardown" })).toBe(
			false,
		);
		expect(isDwRunCli({ command: "bun scripts/dw/index.ts" })).toBe(false);
	});
});

describe("isDwDevSupervisor", () => {
	test("requires --worktree so bare bun dev is left alone", () => {
		expect(
			isDwDevSupervisor({
				command: "bun scripts/dev.ts --worktree 23",
			}),
		).toBe(true);
		expect(isDwDevSupervisor({ command: "bun scripts/dev.ts" })).toBe(false);
		expect(
			isDwDevSupervisor({
				command: "ENV_FILE=.env infisical run -- bun scripts/dev.ts --production",
			}),
		).toBe(false);
	});
});

describe("isDwOrphan", () => {
	test("leftover server/nodemon only if cwd or argv is this worktree", () => {
		expect(
			isDwOrphan({
				command: "bun src/index.ts",
				cwd: "/Users/me/.cursor/worktrees/default/0i2r/server",
				worktreeRoots: roots,
			}),
		).toBe(true);
		expect(
			isDwOrphan({
				command:
					"node /Users/me/.cursor/worktrees/default/0i2r/server/node_modules/.bin/nodemon",
				worktreeRoots: roots,
			}),
		).toBe(true);
		expect(
			isDwOrphan({
				command: "bun src/index.ts",
				cwd: "/Users/me/.cursor/worktrees/main/pwrw/server",
				worktreeRoots: roots,
			}),
		).toBe(false);
		expect(
			isDwOrphan({
				command: "bun src/index.ts",
				worktreeRoots: roots,
			}),
		).toBe(false);
		expect(
			isDwOrphan({
				command:
					"node /Users/me/.cursor/worktrees/default/0i2r/vite/node_modules/.bin/vite --host",
				worktreeRoots: roots,
			}),
		).toBe(true);
	});
});

describe("isUnderWorktree", () => {
	test("does not treat a prefix sibling as the same tree", () => {
		expect(
			isUnderWorktree({
				path: "/Users/me/.cursor/worktrees/default/0i2r-extra/server",
				worktreeRoots: roots,
			}),
		).toBe(false);
		expect(
			isUnderWorktree({
				path: "/Users/me/.cursor/worktrees/default/0i2r/server",
				worktreeRoots: roots,
			}),
		).toBe(true);
	});
});

describe("selectDwPids", () => {
	test("walks descendants of a dw run seed and skips protected + foreign bun", () => {
		const pids = selectDwPids({
			processes: [
				{ pid: 10, ppid: 1, command: "bun scripts/dw/index.ts run" },
				{ pid: 11, ppid: 10, command: "bun scripts/dev.ts --worktree 23" },
				{ pid: 12, ppid: 11, command: "bun src/index.ts" },
				{ pid: 20, ppid: 1, command: "bun src/index.ts" },
				{ pid: 21, ppid: 1, command: "bun test server/foo.test.ts" },
				{ pid: 30, ppid: 1, command: "bun scripts/dw/index.ts kill" },
			],
			worktreeRoots: roots,
			extraSeedPids: [],
			protectedPids: new Set([30]),
		});
		expect(pids).toEqual([10, 11, 12]);
	});

	test("port-holder extra seeds still require the kill walk, not every bun", () => {
		const pids = selectDwPids({
			processes: [
				{ pid: 40, ppid: 1, command: "bun src/index.ts" },
				{ pid: 41, ppid: 1, command: "bun scripts/tw/index.ts" },
			],
			worktreeRoots: roots,
			extraSeedPids: [40],
			protectedPids: new Set(),
		});
		expect(pids).toEqual([40]);
	});
});
