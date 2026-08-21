import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	ensureEmulateRunning,
	stopEmulateAndPortless,
} from "../dw/helpers/emulate.ts";
import {
	registerPortlessAliases,
	unregisterPortlessAliases,
} from "../dw/helpers/portless.ts";
import { fatal, sh } from "../dw/helpers/shell.ts";
import { spawnDevInTmux, tmuxSessionExists } from "../dw/helpers/tmux.ts";

const SCRIPT_DIR = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = join(SCRIPT_DIR, "..", "..");
const CAPY_SESSION = "capy";

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
		"browser API: expose 8080 too; use the browser against http://localhost:3000 and keep API calls same-origin only if 8080 is also exposed",
		"VM/Desktop-local emulate URL: http://google.emulate.localhost",
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
	const res = sh("bash", [join(REPO_ROOT, "scripts/setup/capy-startup.sh")], {
		cwd: REPO_ROOT,
	});
	if (res.code !== 0) {
		fatal(res.stderr || res.stdout || "capy startup failed");
	}
}

function ensureAppProcess(): void {
	ensureBunGlobalBin();
	if (tmuxSessionExists(CAPY_SESSION)) return;
	ensureStartup();
	ensureEmulateRunning();
	registerPortlessAliases(1);
	const env: Record<string, string> = { ...process.env } as Record<
		string,
		string
	>;
	spawnDevInTmux(
		CAPY_SESSION,
		env,
		["bun", "scripts/dev.ts", "--worktree", "1"],
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
	const res = sh("tmux", ["capture-pane", "-pt", CAPY_SESSION]);
	if (res.code !== 0) {
		fatal(`capy logs unavailable: ${res.stderr || res.stdout}`);
	}
	console.log(res.stdout);
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
