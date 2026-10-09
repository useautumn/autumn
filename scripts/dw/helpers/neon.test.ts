import { afterEach, expect, test } from "bun:test";
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const projectRoot = join(import.meta.dir, "..", "..", "..");
const neonHelperUrl = pathToFileURL(join(import.meta.dir, "neon.ts")).href;
const tempDirectories: string[] = [];

afterEach(() => {
	for (const directory of tempDirectories.splice(0)) {
		rmSync(directory, { recursive: true, force: true });
	}
});

function runWaiter(neonScript: string) {
	const directory = mkdtempSync(join(tmpdir(), "autumn-neon-operations-"));
	tempDirectories.push(directory);
	const binDir = join(directory, "bin");
	const callsPath = join(directory, "calls");
	const neonPath = join(binDir, "neon");
	mkdirSync(binDir);
	writeFileSync(neonPath, neonScript);
	chmodSync(neonPath, 0o755);

	const result = Bun.spawnSync(
		[
			"bun",
			"-e",
			`import { waitForNeonBranchOperations } from ${JSON.stringify(neonHelperUrl)}; waitForNeonBranchOperations({ id: "branch-1", name: "capy-1234567" });`,
		],
		{
			cwd: projectRoot,
			env: {
				...process.env,
				PATH: `${binDir}:${process.env.PATH}`,
				NEON_OPERATION_TEST_CALLS: callsPath,
			},
			stdout: "pipe",
			stderr: "pipe",
		},
	);

	return {
		calls: readFileSync(callsPath, "utf8"),
		code: result.exitCode,
		stderr: new TextDecoder().decode(result.stderr),
		stdout: new TextDecoder().decode(result.stdout),
	};
}

test("waitForNeonBranchOperations waits for every matching operation", () => {
	const result = runWaiter(`#!/bin/sh
calls=$(cat "$NEON_OPERATION_TEST_CALLS" 2>/dev/null || echo 0)
calls=$((calls + 1))
printf '%s' "$calls" > "$NEON_OPERATION_TEST_CALLS"
if [ "$calls" -eq 1 ]; then
	cat <<'JSON'
[{"branch_id":"branch-1","action":"create_branch","status":"finished"},{"branch_id":"branch-1","action":"start_compute","status":"finished"},{"branch_id":"branch-1","action":"timeline_update_protected_config","status":"running"},{"branch_id":"other-branch","action":"delete_branch","status":"failed"}]
JSON
else
	cat <<'JSON'
[{"branch_id":"branch-1","action":"create_branch","status":"finished"},{"branch_id":"branch-1","action":"start_compute","status":"finished"},{"branch_id":"branch-1","action":"timeline_update_protected_config","status":"finished"}]
JSON
fi
`);

	expect(result.code).toBe(0);
	expect(result.calls).toBe("2");
	expect(result.stdout).toContain(
		"[dw] neon branch capy-1234567 operations ready",
	);
});

test("waitForNeonBranchOperations fails on a matching terminal failure", () => {
	const result = runWaiter(`#!/bin/sh
printf '1' > "$NEON_OPERATION_TEST_CALLS"
echo '[{"branch_id":"branch-1","action":"start_compute","status":"failed"}]'
`);

	expect(result.code).toBe(1);
	expect(result.stderr).toContain(
		"[dw] neon branch capy-1234567 operation start_compute entered terminal failure status failed",
	);
});

function runCreateBranch(opts: string) {
	const directory = mkdtempSync(join(tmpdir(), "autumn-neon-create-"));
	tempDirectories.push(directory);
	const binDir = join(directory, "bin");
	const callsPath = join(directory, "calls");
	const neonPath = join(binDir, "neon");
	mkdirSync(binDir);
	writeFileSync(
		neonPath,
		`#!/bin/sh
printf '%s\\n' "$@" > "$NEON_CREATE_TEST_CALLS"
echo '{"branch":{"id":"branch-1","name":"capy-1234567"}}'
`,
	);
	chmodSync(neonPath, 0o755);

	const result = Bun.spawnSync(
		[
			"bun",
			"-e",
			`import { createBranch } from ${JSON.stringify(neonHelperUrl)}; createBranch("capy-1234567", "dw-template", ${opts});`,
		],
		{
			cwd: projectRoot,
			env: {
				...process.env,
				PATH: `${binDir}:${process.env.PATH}`,
				NEON_CREATE_TEST_CALLS: callsPath,
			},
			stdout: "pipe",
			stderr: "pipe",
		},
	);

	return {
		args: readFileSync(callsPath, "utf8").trim().split("\n"),
		code: result.exitCode,
	};
}

test("createBranch passes --expires-at when given", () => {
	const result = runCreateBranch(`{ expiresAt: "2026-10-22T00:00:00.000Z" }`);

	expect(result.code).toBe(0);
	expect(result.args.slice(-2)).toEqual([
		"--expires-at",
		"2026-10-22T00:00:00.000Z",
	]);
});

test("createBranch sets no expiry by default", () => {
	const result = runCreateBranch("{}");

	expect(result.code).toBe(0);
	expect(result.args).not.toContain("--expires-at");
});
