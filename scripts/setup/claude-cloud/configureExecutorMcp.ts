import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const quoteShellArgument = (value: string): string =>
	`'${value.replaceAll("'", "'\\''")}'`;

export const configureExecutorMcp = ({
	rootDir,
}: {
	rootDir: string;
}): void => {
	if (process.env.CLAUDE_CODE_REMOTE !== "true") return;

	const root = resolve(rootDir);
	const { servers } = JSON.parse(
		readFileSync(join(root, "ai/config/mcps.json"), "utf8"),
	);
	const { workspaceId } = JSON.parse(
		readFileSync(join(root, ".infisical.json"), "utf8"),
	);
	if (!servers.executor?.url || !workspaceId) {
		throw new Error("Executor URL or Infisical project ID is missing");
	}

	const helperPath = join(
		root,
		"scripts/setup/claude-cloud/executorHeaders.sh",
	);
	const config = JSON.stringify({
		type: "http",
		url: servers.executor.url,
		headersHelper: `bash ${quoteShellArgument(helperPath)} ${quoteShellArgument(workspaceId)}`,
	});

	// User scope supports cloud sessions without granting repository-wide workspace trust.
	spawnSync("claude", ["mcp", "remove", "--scope", "user", "executor-cloud"], {
		cwd: root,
		stdio: "ignore",
	});
	const added = spawnSync(
		"claude",
		["mcp", "add-json", "--scope", "user", "executor-cloud", config],
		{ cwd: root, stdio: "ignore" },
	);
	if (added.error || added.status !== 0) {
		throw new Error("Could not register Executor's Infisical headers helper");
	}
};

if (import.meta.main) configureExecutorMcp({ rootDir: process.cwd() });
