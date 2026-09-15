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
const writeResolvedKey = async ({ key }: { key: string }): Promise<void> => {
	const config = await Bun.file(MCP_PATH).json();
	const executor = config.mcpServers?.executor;
	if (!executor) throw new Error(`no executor server in ${MCP_PATH}`);

	executor.headers = { Authorization: `Bearer ${key}` };
	// Claude prefers OAuth when both are offered, and OAuth cannot complete headless.
	delete executor.oauth;

	await Bun.write(MCP_PATH, `${JSON.stringify(config, null, "\t")}\n`);
	chmodSync(MCP_PATH, 0o600);
};

const projectId = await readInfisicalProjectId();
const key = await fetchExecutorKey({ projectId });
if (key) {
	await writeResolvedKey({ key });
	log("executor MCP: resolved API key into .mcp.json");
} else {
	log("EXECUTOR_API_KEY unavailable — Executor MCP will fall back to OAuth");
}
