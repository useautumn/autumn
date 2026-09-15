#!/usr/bin/env bun
import { chmodSync } from "node:fs";
import { join } from "node:path";

const PROJECT_ROOT = join(import.meta.dir, "../../..");
const MCP_PATH = join(PROJECT_ROOT, ".mcp.json");
const INFISICAL_PATH = join(PROJECT_ROOT, ".infisical.json");

const log = (message: string): void => console.log(`[conductor] ${message}`);

const readInfisicalProjectId = async (): Promise<string> => {
	const { workspaceId } = await Bun.file(INFISICAL_PATH).json();
	if (typeof workspaceId !== "string" || !workspaceId)
		throw new Error(`no workspaceId in ${INFISICAL_PATH}`);
	return workspaceId;
};

const fetchExecutorKey = async ({
	projectId,
}: {
	projectId: string;
}): Promise<string> => {
	const fromEnv = (process.env.EXECUTOR_API_KEY ?? "").trim();
	if (fromEnv) return fromEnv;

	const result = Bun.spawnSync(
		[
			"infisical",
			"secrets",
			"get",
			"EXECUTOR_API_KEY",
			`--projectId=${projectId}`,
			"--env=dev",
			"--recursive",
			"--plain",
			"--silent",
		],
		{ stderr: "ignore" },
	);
	return result.exitCode === 0 ? result.stdout.toString().trim() : "";
};

/** Swap Claude's `${EXECUTOR_API_KEY}` placeholder for the real key. */
const writeResolvedKey = async ({ key }: { key: string }): Promise<boolean> => {
	// .mcp.json is written by `bun ai sync`, which needs the private ai submodule
	// a Conductor setup script cannot clone. Absent is expected, not an error.
	if (!(await Bun.file(MCP_PATH).exists())) {
		log(`${MCP_PATH} not written yet — run \`bun ai/src/cli.ts sync\` first`);
		return false;
	}

	const config = await Bun.file(MCP_PATH).json();
	const executor = config.mcpServers?.executor;
	if (!executor) {
		log(`no executor server in ${MCP_PATH}`);
		return false;
	}

	executor.headers = { Authorization: `Bearer ${key}` };
	// Claude prefers OAuth when both are offered, and OAuth cannot complete headless.
	delete executor.oauth;

	await Bun.write(MCP_PATH, `${JSON.stringify(config, null, "\t")}\n`);
	chmodSync(MCP_PATH, 0o600);
	return true;
};

const projectId = await readInfisicalProjectId();
const key = await fetchExecutorKey({ projectId });
if (key) {
	if (await writeResolvedKey({ key }))
		log("executor MCP: resolved API key into .mcp.json");
} else {
	log("EXECUTOR_API_KEY unavailable — Executor MCP will fall back to OAuth");
}
