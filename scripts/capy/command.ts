import {
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	ensureEmulateRunning,
	stopEmulateAndPortless,
} from "../dw/helpers/emulate.ts";
import {
	registerPortlessAliases,
	unregisterPortlessAliases,
} from "../dw/helpers/portless.ts";
import { fatal, sh, shInherit } from "../dw/helpers/shell.ts";
import { spawnDevInTmux, tmuxSessionExists } from "../dw/helpers/tmux.ts";

const SCRIPT_DIR = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = join(SCRIPT_DIR, "..", "..");
const CAPY_SESSION = "capy";
const CAPY_PREFIX =
	process.env.CAPY_PREFIX ??
	join(process.env.HOME ?? "/home/user", ".autumn-capy");

type CapyLogPaths = {
	startup: string;
	app: string;
};

function capyLogPaths({
	prefix = CAPY_PREFIX,
}: {
	prefix?: string;
} = {}): CapyLogPaths {
	return {
		startup: join(prefix, "startup.log"),
		app: join(prefix, "app.log"),
	};
}

function readLog(path: string): string | undefined {
	if (!existsSync(path)) return undefined;
	return readFileSync(path, "utf-8");
}

function logSection({
	title,
	path,
	contents,
}: {
	title: string;
	path: string;
	contents: string;
}): string {
	return `=== ${title}: ${path} ===\n${contents.trimEnd() || "(empty)"}`;
}

function capyLogsText({
	paths,
	captureTmuxLogs,
}: {
	paths: CapyLogPaths;
	captureTmuxLogs?: () => string | undefined;
}): string {
	const sections: string[] = [];
	const startupLog = readLog(paths.startup);
	if (startupLog !== undefined) {
		sections.push(
			logSection({
				title: "Startup log",
				path: paths.startup,
				contents: startupLog,
			}),
		);
	}

	const appLog = readLog(paths.app);
	if (appLog !== undefined) {
		sections.push(
			logSection({
				title: "App log",
				path: paths.app,
				contents: appLog,
			}),
		);
	} else {
		const tmuxLogs = captureTmuxLogs?.();
		if (tmuxLogs !== undefined) {
			sections.push(
				logSection({
					title: "App log (tmux fallback)",
					path: CAPY_SESSION,
					contents: tmuxLogs,
				}),
			);
		}
	}

	if (sections.length > 0) return sections.join("\n\n");
	return [
		"No Capy logs found.",
		`Startup log: ${paths.startup}`,
		`App log: ${paths.app}`,
	].join("\n");
}

function ensureBunGlobalBin(): void {
	const bin =
		sh("bun", ["pm", "-g", "bin"]).stdout ||
		`${process.env.HOME ?? "/home/user"}/.bun/bin`;
	if (!process.env.PATH?.includes(bin)) {
		process.env.PATH = `${bin}:${process.env.PATH ?? ""}`;
	}
}

export function capyHandoffText(): string {
	return [
		"Capy is ready.",
		`tmux session: ${CAPY_SESSION}`,
		"local ports: 3000 dashboard, 8080 server, 3001 checkout, 3099 leaf/chat, 4000 emulate",
		"browser API uses /__autumn_api via the Capy Vite proxy; expose only port 3000",
		"VM/Desktop-local emulate URL: https://google.emulate.localhost",
		`logs: bun capy logs | attach: tmux attach -t ${CAPY_SESSION}`,
	].join("\n");
}

function http200(url: string): boolean {
	return (
		sh("bash", [
			"-lc",
			`code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 1 ${JSON.stringify(url)}); [ "$code" = 200 ]`,
		]).code === 0
	);
}

async function waitForReady(): Promise<void> {
	for (let i = 0; i < 120; i++) {
		if (!tmuxSessionExists(CAPY_SESSION)) {
			fatal(`capy tmux session ${CAPY_SESSION} exited before readiness`);
		}
		if (
			http200("http://localhost:3000/") &&
			http200("http://localhost:8080/api/auth/get-session")
		) {
			return;
		}
		await Bun.sleep(250);
	}
	fatal("capy app did not become ready on :3000 and :8080");
}

function ensureStartup(): void {
	const code = shInherit(
		"bash",
		[join(REPO_ROOT, "scripts/setup/capy-startup.sh")],
		{
			cwd: REPO_ROOT,
		},
	);
	if (code !== 0) {
		fatal("capy startup failed");
	}
}

function ensureAppProcess(): void {
	ensureBunGlobalBin();
	if (tmuxSessionExists(CAPY_SESSION)) return;
	ensureStartup();
	ensureEmulateRunning();
	registerPortlessAliases(1);
	const env: Record<string, string> = {
		...process.env,
		CAPY_DEV: "1",
		VITE_EMULATE_GOOGLE_PROXY: "1",
	} as Record<string, string>;
	const { app: appLog } = capyLogPaths();
	mkdirSync(dirname(appLog), { recursive: true, mode: 0o700 });
	writeFileSync(appLog, "", { mode: 0o600 });
	chmodSync(appLog, 0o600);
	spawnDevInTmux(
		CAPY_SESSION,
		env,
		[
			"bash",
			"-lc",
			`set -o pipefail; bun scripts/dev.ts --worktree 1 2>&1 | tee -a '${appLog.replace(/'/g, "'\\''")}'`,
		],
		REPO_ROOT,
	);
}

export async function cmdCapy(): Promise<void> {
	ensureAppProcess();
	await waitForReady();
	console.log(capyHandoffText());
}

export function cmdCapyStatus(): void {
	console.log(
		tmuxSessionExists(CAPY_SESSION) ? `running (${CAPY_SESSION})` : "stopped",
	);
}

export function cmdCapyLogs(): void {
	console.log(
		capyLogsText({
			paths: capyLogPaths(),
			captureTmuxLogs: () => {
				const res = sh("tmux", ["capture-pane", "-pt", CAPY_SESSION]);
				return res.code === 0 ? res.stdout : undefined;
			},
		}),
	);
}

export function cmdCapyStop(): void {
	if (tmuxSessionExists(CAPY_SESSION)) {
		sh("tmux", ["kill-session", "-t", CAPY_SESSION]);
	}
	stopEmulateAndPortless();
	unregisterPortlessAliases(1);
}

export async function cmdCapyRestart(): Promise<void> {
	cmdCapyStop();
	await cmdCapy();
}
