import { afterEach, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const directories: string[] = [];
const scriptsDir = import.meta.dir;
const createFixture = () => {
	const root = mkdtempSync(join(tmpdir(), "claude-executor-"));
	directories.push(root);
	const bin = join(root, "bin");
	mkdirSync(bin);
	return { root, bin };
};

afterEach(() => {
	for (const directory of directories.splice(0))
		rmSync(directory, { recursive: true });
});

test("snapshot setup embeds the same helper and registers it without credentials", () => {
	const { root } = createFixture();
	const setup = readFileSync(
		resolve(scriptsDir, "../../../agent-envs/claude-cloud/setup.sh"),
		"utf8",
	);
	const helper = setup
		.split("<<'EXECUTOR_HEADERS'\n")[1]
		?.split("EXECUTOR_HEADERS\n")[0];
	expect(helper).toBe(
		readFileSync(join(scriptsDir, "executorHeaders.sh"), "utf8"),
	);
	const script = setup
		.split("<<'EXECUTOR_CONFIG'\n")[1]
		?.split("EXECUTOR_CONFIG\n")[0];
	if (!script) throw new Error("Embedded MCP registration script is missing");
	writeFileSync(
		join(root, ".infisical.json"),
		JSON.stringify({ workspaceId: "test-project" }),
	);
	writeFileSync(
		join(root, ".claude.json"),
		JSON.stringify({
			theme: "dark",
			mcpServers: { existing: { type: "http", url: "https://example.com" } },
		}),
	);
	const result = spawnSync("node", ["-e", script], {
		env: {
			...process.env,
			AUTUMN_BOOTSTRAP_DIR: root,
			CLAUDE_CONFIG_DIR: root,
			INFISICAL_CLIENT_SECRET: "do-not-store",
		},
		encoding: "utf8",
	});
	expect(result.status).toBe(0);
	const serialized = readFileSync(join(root, ".claude.json"), "utf8");
	const config = JSON.parse(serialized);
	expect(config.theme).toBe("dark");
	expect(config.mcpServers.existing.url).toBe("https://example.com");
	expect(config.mcpServers["executor-cloud"].headersHelper).toBe(
		"/usr/local/bin/autumn-executor-headers 'test-project'",
	);
	expect(serialized).not.toContain("do-not-store");
});

test("fetches only the dev Executor key and emits escaped JSON headers", () => {
	const { root, bin } = createFixture();
	const calls = join(root, "calls");
	writeFileSync(
		join(bin, "infisical"),
		`#!/bin/sh
printf '%s\\n' "$*" >> "$TEST_CALLS"
if [ "$1" = login ]; then
  printf 'fresh-test-token'
else
  test "$INFISICAL_TOKEN" = fresh-test-token || exit 1
  printf '%s' "$TEST_EXECUTOR_KEY"
fi
`,
		{ mode: 0o755 },
	);
	const key = 'test-key-with-"quotes"-and-\\slashes';
	const result = spawnSync(
		"bash",
		[join(scriptsDir, "executorHeaders.sh"), "test-project"],
		{
			env: {
				...process.env,
				BASH_ENV: "",
				PATH: `${bin}:${process.env.PATH}`,
				INFISICAL_CLIENT_ID: "test-client",
				INFISICAL_CLIENT_SECRET: "test-secret",
				INFISICAL_TOKEN: "expired-test-token",
				EXECUTOR_API_KEY: "stale-key",
				TEST_EXECUTOR_KEY: key,
				TEST_CALLS: calls,
			},
			encoding: "utf8",
		},
	);
	expect(result.status).toBe(0);
	expect(JSON.parse(result.stdout)).toEqual({ Authorization: `Bearer ${key}` });
	expect(result.stderr).toBe("");
	expect(readFileSync(calls, "utf8")).toContain(
		"--projectId=test-project --env=dev --recursive --plain --silent",
	);
});

test("runtime secret pulls pass the machine identity's project explicitly", () => {
	const { root, bin } = createFixture();
	writeFileSync(
		join(root, ".infisical.json"),
		JSON.stringify({ workspaceId: "test-project" }),
	);
	writeFileSync(
		join(bin, "infisical"),
		`#!/bin/sh
test "$*" = 'secrets get TEST_SECRET --projectId=test-project --env=dev --recursive --plain --silent' || exit 1
printf 'fixture-value'
`,
		{ mode: 0o755 },
	);
	const hook = readFileSync(join(scriptsDir, "session-start.sh"), "utf8");
	const lookup = hook.slice(
		hook.indexOf("infisical_project_id="),
		hook.indexOf("\npull_infisical STRIPE_SANDBOX_SECRET_KEY"),
	);
	const result = spawnSync(
		"bash",
		[
			"-c",
			`${lookup}\npull_infisical TEST_SECRET\ntest "$TEST_SECRET" = fixture-value`,
		],
		{
			cwd: root,
			env: {
				...process.env,
				BASH_ENV: "",
				PATH: `${bin}:${process.env.PATH}`,
				INFISICAL_TOKEN: "fixture-token",
				TEST_SECRET: "",
			},
			encoding: "utf8",
		},
	);
	expect(result.status).toBe(0);
	expect(result.stdout).toBe("");
	expect(result.stderr).toBe("");
});

for (const failure of ["login", "fetch", "empty", "multiline"]) {
	test(`fails closed for ${failure} without leaking credentials`, () => {
		const { bin } = createFixture();
		writeFileSync(
			join(bin, "infisical"),
			`#!/bin/sh
if [ "$TEST_FAILURE" = login ] || { [ "$1" = secrets ] && [ "$TEST_FAILURE" = fetch ]; }; then
  echo 'sensitive diagnostic' >&2
  exit 1
fi
if [ "$1" = login ]; then printf 'test-token';
elif [ "$TEST_FAILURE" = multiline ]; then printf 'first\\nsecond'; fi
`,
			{ mode: 0o755 },
		);
		const result = spawnSync(
			"bash",
			[join(scriptsDir, "executorHeaders.sh"), "test-project"],
			{
				env: {
					...process.env,
					BASH_ENV: "",
					PATH: `${bin}:${process.env.PATH}`,
					INFISICAL_CLIENT_ID: "test-client",
					INFISICAL_CLIENT_SECRET: "test-secret",
					EXECUTOR_API_KEY: "must-not-fallback",
					TEST_FAILURE: failure,
				},
				encoding: "utf8",
			},
		);
		expect(result.status).toBe(1);
		expect(result.stdout).toBe("");
		expect(result.stderr).not.toContain("sensitive diagnostic");
		expect(result.stderr).not.toContain("test-secret");
	});
}

test("registers a cloud-only user server without serializing credentials", () => {
	const { root, bin } = createFixture();
	const project = join(root, "project with 'quote'");
	mkdirSync(join(project, "ai/config"), { recursive: true });
	writeFileSync(
		join(project, "ai/config/mcps.json"),
		JSON.stringify({
			servers: { executor: { url: "https://example.com/mcp" } },
		}),
	);
	writeFileSync(
		join(project, ".infisical.json"),
		JSON.stringify({ workspaceId: "test-project" }),
	);
	const calls = join(root, "claude-calls");
	writeFileSync(
		join(bin, "claude"),
		`#!/usr/bin/env node
require('node:fs').appendFileSync(process.env.TEST_CALLS, JSON.stringify(process.argv.slice(2)) + '\\n');
`,
		{ mode: 0o755 },
	);
	const run = (remote: string) =>
		spawnSync(
			process.execPath,
			[resolve(scriptsDir, "configureExecutorMcp.ts")],
			{
				cwd: project,
				env: {
					...process.env,
					PATH: `${bin}:${process.env.PATH}`,
					CLAUDE_CODE_REMOTE: remote,
					TEST_CALLS: calls,
					EXECUTOR_API_KEY: "must-not-serialize",
				},
				encoding: "utf8",
			},
		);
	expect(run("false").status).toBe(0);
	expect(run("true").status).toBe(0);
	const commands = readFileSync(calls, "utf8")
		.trim()
		.split("\n")
		.map((line) => JSON.parse(line));
	expect(commands).toHaveLength(2);
	expect(commands[0]).toEqual([
		"mcp",
		"remove",
		"--scope",
		"user",
		"executor-cloud",
	]);
	expect(commands[1].slice(0, 5)).toEqual([
		"mcp",
		"add-json",
		"--scope",
		"user",
		"executor-cloud",
	]);
	const config = JSON.parse(commands[1][5]);
	expect(config.type).toBe("http");
	expect(config.url).toBe("https://example.com/mcp");
	expect(config.headers).toBeUndefined();
	expect(config.headersHelper).toContain("'\\''");
	expect(readFileSync(calls, "utf8")).not.toContain("must-not-serialize");
});
