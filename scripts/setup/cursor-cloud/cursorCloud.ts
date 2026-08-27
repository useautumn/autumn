#!/usr/bin/env bun
import {
	chmodSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const EXECUTOR_URL = "https://executor.sh/mcp";
const ENV_PLACEHOLDER = "Bearer ${env:EXECUTOR_API_KEY}";
const AGENTS_BEGIN = "<!-- cursor-cloud-specific-instructions -->";
const AGENTS_END = "<!-- /cursor-cloud-specific-instructions -->";

const AGENTS_CLOUD_SECTION = `${AGENTS_BEGIN}

## Cursor Cloud specific instructions

Skills come from the \`ai/\` submodule via \`bun ai sync --copy\` during
\`install\`, before workspace \`bun install\`. After boot you should have
\`/tdd\` and \`/explain\`. If those are missing:
\`bun ai/src/cli.ts sync --copy\`.

Executor MCP (\`https://executor.sh/mcp\`) is the front door for external tools.
\`start\` pulls \`EXECUTOR_API_KEY\` from Infisical (or a Team Runtime Secret)
and writes the Bearer header into \`.cursor/mcp.json\`. Do not try interactive
OAuth. If executor tools are missing, say so rather than substituting
Axiom/PlanetScale OAuth servers.

Boot starts local infra (Postgres/Redis/ClickHouse/ElasticMQ), seeds
\`unit-test-org\`, and the Cloudflare public URL via
\`bun scripts/dw/index.ts start\`. It does **not** start the app.
Run \`bun dw\` when the task needs Vite/API.
\`bun t\` must use local Postgres via \`server/.env\` / \`.env.local\`.
Infisical's PlanetScale \`DATABASE_URL\` against the local API causes
Stripe \`No such customer\`.
The in-IDE Browser tab stays blank (Cursor bug, any URL) — open the
public \`autumn-wt1-<hash>.autumnworktree.com\` URL from \`bun dw identify\`,
or \`http://localhost:3000\` from Ports.

${AGENTS_END}
`;

function chmodPrivate(path: string): void {
	chmodSync(path, 0o600);
}

export function writeExecutorMcp({
	root,
	userMcpPath,
	authorization,
}: {
	root: string;
	userMcpPath: string;
	authorization: string;
}): void {
	const path = join(root, ".cursor", "mcp.json");
	mkdirSync(dirname(path), { recursive: true });

	let data: { mcpServers?: Record<string, unknown> } = { mcpServers: {} };
	if (existsSync(path)) {
		try {
			const loaded = JSON.parse(readFileSync(path, "utf8"));
			if (loaded && typeof loaded === "object") data = loaded;
		} catch {
			console.error("[cursor-cloud] existing .cursor/mcp.json was invalid; rewriting");
		}
	}

	const servers =
		data.mcpServers && typeof data.mcpServers === "object" ? data.mcpServers : {};
	data.mcpServers = servers;

	const existing = servers.executor;
	const merged: Record<string, unknown> =
		existing && typeof existing === "object"
			? { ...(existing as Record<string, unknown>) }
			: {};
	merged.url = EXECUTOR_URL;
	merged.headers = { Authorization: authorization };
	delete merged.oauth;
	servers.executor = merged;

	const text = `${JSON.stringify(data, null, "\t")}\n`;
	writeFileSync(path, text);
	chmodPrivate(path);
	mkdirSync(dirname(userMcpPath), { recursive: true });
	writeFileSync(userMcpPath, text);
	chmodPrivate(userMcpPath);

	const viaEnv = authorization.includes("${env:EXECUTOR_API_KEY}");
	console.log(
		`[cursor-cloud] executor MCP: wrote Authorization header (${viaEnv ? "env interpolation" : "bearer from env"}) to ${path} and ${userMcpPath}`,
	);
}

const CLOUD_ENVIRONMENTS = "environments: [cloud]";

export function addCloudEnvironmentsFrontmatter(content: string): string {
	if (/(^|\n)environments:\s*\[/m.test(content)) return content;

	const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/);
	if (!match) {
		return `---\n${CLOUD_ENVIRONMENTS}\n---\n\n${content}`;
	}

	const closing = match[2] || "\n";
	return `---\n${match[1].replace(/\s+$/, "")}\n${CLOUD_ENVIRONMENTS}\n---${closing}${content.slice(match[0].length)}`;
}

export function markCloudUserSkills({
	userSkillsDir = join(homedir(), ".cursor", "skills"),
}: {
	userSkillsDir?: string;
} = {}): number {
	if (!existsSync(userSkillsDir)) return 0;

	let marked = 0;
	for (const name of readdirSync(userSkillsDir)) {
		const skillMd = join(userSkillsDir, name, "SKILL.md");
		if (!existsSync(skillMd)) continue;
		const original = readFileSync(skillMd, "utf8");
		const next = addCloudEnvironmentsFrontmatter(original);
		if (next === original) continue;
		writeFileSync(skillMd, next);
		marked++;
	}
	if (marked > 0) {
		console.log(
			`[cursor-cloud] marked ${marked} user skill(s) with ${CLOUD_ENVIRONMENTS}`,
		);
	}
	return marked;
}

const appendOnce = ({ filePath, line }: { filePath: string; line: string }): void => {
	mkdirSync(dirname(filePath), { recursive: true });
	const existing = existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
	if (existing.split("\n").includes(line)) return;
	writeFileSync(filePath, `${existing}${existing && !existing.endsWith("\n") ? "\n" : ""}${line}\n`);
};

export function persistCloudAgentEnv({
	root,
	home = homedir(),
}: {
	root: string;
	home?: string;
}): string {
	const envSh = join(home, ".autumn-agent", "env.sh");
	mkdirSync(dirname(envSh), { recursive: true });
	const text = `# Generated by cursorCloud.ts persist-env
export CLOUD_AGENT=1
export DW_HEADLESS=1
export PATH="${root}/node_modules/.bin:/usr/local/bin:$HOME/.bun/bin:$PATH"
if [ -z "\${INFISICAL_TOKEN:-}" ] && [ -s "$HOME/.cache/autumn-infisical-token" ]; then
  INFISICAL_TOKEN="$(cat "$HOME/.cache/autumn-infisical-token")"
  export INFISICAL_TOKEN
fi
if [ -z "\${INFISICAL_PROJECT_ID:-}" ] && [ -f "${root}/.infisical.json" ]; then
  INFISICAL_PROJECT_ID="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("workspaceId") or "")' "${root}/.infisical.json" 2>/dev/null || true)"
  [ -n "$INFISICAL_PROJECT_ID" ] && export INFISICAL_PROJECT_ID
fi
`;
	writeFileSync(envSh, text);
	chmodPrivate(envSh);
	appendOnce({ filePath: join(home, ".bashrc"), line: "export CLOUD_AGENT=1" });
	appendOnce({ filePath: join(home, ".bashrc"), line: "export DW_HEADLESS=1" });
	appendOnce({ filePath: join(home, ".bashrc"), line: `. ${envSh}` });
	appendOnce({ filePath: join(home, ".bashrc"), line: `export BASH_ENV=${envSh}` });
	appendOnce({ filePath: join(home, ".profile"), line: `. ${envSh}` });
	appendOnce({ filePath: join(home, ".zshenv"), line: `. ${envSh}` });
	console.log(`[cursor-cloud] wrote ${envSh}`);
	return envSh;
}

export function appendAgentsCloudSection({ root }: { root: string }): void {
	const path = join(root, "AGENTS.md");
	const existing = existsSync(path) ? readFileSync(path, "utf8") : "";
	let text: string;
	if (existing.includes(AGENTS_BEGIN) && existing.includes(AGENTS_END)) {
		const before = existing.split(AGENTS_BEGIN, 1)[0].trimEnd();
		const after = existing.split(AGENTS_END).slice(1).join(AGENTS_END).trimStart();
		text = `${before}${before ? "\n\n" : ""}${AGENTS_CLOUD_SECTION}${after ? `\n${after}` : ""}`;
	} else {
		text = `${existing.trimEnd()}${existing.trim() ? "\n\n" : ""}${AGENTS_CLOUD_SECTION}`;
	}
	if (!text.endsWith("\n")) text += "\n";
	writeFileSync(path, text);
	console.log(`[cursor-cloud] wrote Cursor Cloud section to ${path}`);
}

function parseArgs(argv: string[]): {
	cmd: string;
	root: string;
	userMcp: string;
	userSkills: string;
	home: string;
} {
	let root = process.cwd();
	let userMcp = join(homedir(), ".cursor", "mcp.json");
	let userSkills = join(homedir(), ".cursor", "skills");
	let home = homedir();
	const rest: string[] = [];
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--root") root = argv[++i] ?? root;
		else if (arg === "--user-mcp") userMcp = argv[++i] ?? userMcp;
		else if (arg === "--user-skills") userSkills = argv[++i] ?? userSkills;
		else if (arg === "--home") home = argv[++i] ?? home;
		else rest.push(arg);
	}
	const cmd = rest[0] ?? "";
	return { cmd, root, userMcp, userSkills, home };
}

const main = (): number => {
	const { cmd, root, userMcp, userSkills, home } = parseArgs(
		process.argv.slice(2),
	);
	if (cmd === "agents-md") {
		appendAgentsCloudSection({ root });
		return 0;
	}
	if (cmd === "mark-skills") {
		markCloudUserSkills({ userSkillsDir: userSkills });
		return 0;
	}
	if (cmd === "persist-env") {
		persistCloudAgentEnv({ root, home });
		return 0;
	}
	if (cmd === "mcp") {
		const key = (process.env.EXECUTOR_API_KEY ?? "").trim();
		writeExecutorMcp({
			root,
			userMcpPath: userMcp,
			authorization: key ? `Bearer ${key}` : ENV_PLACEHOLDER,
		});
		return 0;
	}
	console.error(
		"Usage: bun scripts/setup/cursor-cloud/cursorCloud.ts <agents-md|mark-skills|persist-env|mcp>",
	);
	return 2;
};

if (import.meta.main) {
	process.exit(main());
}
