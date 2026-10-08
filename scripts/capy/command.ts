import {
	appendFileSync,
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fatal, sh, shInherit } from "../dw/helpers/shell.ts";
import { spawnDevInTmux, tmuxSessionExists } from "../dw/helpers/tmux.ts";
import { applyOptInFlags, capyDevServices, withheldEnvKeys } from "./optIns.ts";

const SCRIPT_DIR = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = join(SCRIPT_DIR, "..", "..");
const CAPY_SESSION = "capy";
const CAPY_PREFIX =
	process.env.CAPY_PREFIX ??
	join(process.env.HOME ?? "/home/user", ".autumn-capy");
const APP_MODE_PATH = join(CAPY_PREFIX, "app-mode");
const SERVER_ONLY_FLAG = "--server-only";

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

export function ensureBunGlobalBin(): void {
	const bin =
		sh("bun", ["pm", "-g", "bin"]).stdout ||
		`${process.env.HOME ?? "/home/user"}/.bun/bin`;
	if (!process.env.PATH?.includes(bin)) {
		process.env.PATH = `${bin}:${process.env.PATH ?? ""}`;
	}
}

export function ensureCapyBashrc({
	machineConfig = process.env.CAPY_MACHINE_CONFIG,
	home = process.env.HOME ?? "/home/user",
}: {
	machineConfig?: string;
	home?: string;
} = {}): void {
	if (!machineConfig || !existsSync(machineConfig)) return;
	const bashrc = join(home, ".bashrc");
	const contents = readLog(bashrc) ?? "";
	const command = "cd /workspace/autumn";
	if (contents.split("\n").some((line) => line.trim() === command)) return;
	appendFileSync(bashrc, `${contents.endsWith("\n") ? "" : "\n"}${command}\n`);
}

export function capyHandoffText({
	serverOnly = false,
}: {
	serverOnly?: boolean;
} = {}): string {
	return [
		serverOnly
			? "Capy server-only stack is ready (no dashboard)."
			: "Capy is ready.",
		`tmux session: ${CAPY_SESSION}`,
		serverOnly
			? "local ports: 8080 server | run `bun capy` for the dashboard"
			: "local ports: 3000 dashboard, 8080 server (3001 checkout, 3099 leaf/chat when opted in)",
		"opt-ins: ls ~/.autumn-capy/opt-ins | enable: bun capy restart --trigger|--eve|--checkout|--atom",
		...(serverOnly
			? []
			: [
					"browser API uses /__autumn_api via the Capy Vite proxy; expose only port 3000",
				]),
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

async function waitForReady({
	serverOnly,
}: {
	serverOnly: boolean;
}): Promise<void> {
	for (let i = 0; i < 120; i++) {
		if (!tmuxSessionExists(CAPY_SESSION)) {
			fatal(`capy tmux session ${CAPY_SESSION} exited before readiness`);
		}
		if (
			(serverOnly || http200("http://localhost:3000/")) &&
			http200("http://localhost:8080/api/auth/get-session")
		) {
			return;
		}
		await Bun.sleep(250);
	}
	fatal(
		serverOnly
			? "capy server did not become ready on :8080"
			: "capy app did not become ready on :3000 and :8080",
	);
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

export function capyUnsetCommand(keys: string[]): string {
	return keys.length > 0 ? `unset ${keys.join(" ")}; ` : "";
}

/** A running server-only stack lacks the dashboard, so a full `bun capy` replaces it. */
function runningStackSatisfies({ serverOnly }: { serverOnly: boolean }) {
	if (!tmuxSessionExists(CAPY_SESSION)) return false;
	if (serverOnly) return true;
	return readLog(APP_MODE_PATH)?.trim() !== "server-only";
}

function ensureAppProcess({ serverOnly }: { serverOnly: boolean }): void {
	ensureBunGlobalBin();
	if (runningStackSatisfies({ serverOnly })) return;
	cmdCapyStop();
	ensureStartup();
	const env: Record<string, string> = {
		...process.env,
		CAPY_DEV: "1",
		VITE_EMULATE_GOOGLE_PROXY: "1",
		DEV_SERVICES: capyDevServices({ serverOnly }).join(","),
		WORKER_PROCESSES: "1",
	} as Record<string, string>;
	const withheld = withheldEnvKeys();
	for (const key of withheld) delete env[key];
	const { app: appLog } = capyLogPaths();
	mkdirSync(dirname(appLog), { recursive: true, mode: 0o700 });
	writeFileSync(appLog, "", { mode: 0o600 });
	chmodSync(appLog, 0o600);
	writeFileSync(APP_MODE_PATH, serverOnly ? "server-only\n" : "full\n", {
		mode: 0o600,
	});
	spawnDevInTmux(
		CAPY_SESSION,
		env,
		[
			"bash",
			"-lc",
			// The login shell re-exports Capy's project secrets, so withheld keys are unset after it.
			`${capyUnsetCommand(withheld)}set -o pipefail; bun scripts/dev.ts --worktree 1 2>&1 | tee -a '${appLog.replace(/'/g, "'\\''")}'`,
		],
		REPO_ROOT,
	);
}

export async function cmdCapy({
	args = [],
}: {
	args?: string[];
} = {}): Promise<void> {
	if (applyOptInFlags({ args })) cmdCapyStop();
	const serverOnly = args.includes(SERVER_ONLY_FLAG);
	ensureCapyBashrc();
	ensureAppProcess({ serverOnly });
	await waitForReady({ serverOnly });
	console.log(capyHandoffText({ serverOnly }));
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

/** Every process under the given roots, roots included; `psOutput` is `ps -eo pid=,ppid=`. */
export function descendantPids({
	roots,
	psOutput,
}: {
	roots: number[];
	psOutput: string;
}): number[] {
	const children = new Map<number, number[]>();
	for (const line of psOutput.split("\n")) {
		const [pid, ppid] = line.trim().split(/\s+/).map(Number);
		if (!pid || ppid === undefined) continue;
		children.set(ppid, [...(children.get(ppid) ?? []), pid]);
	}
	const found = new Set<number>();
	const queue = [...roots];
	while (queue.length > 0) {
		const pid = queue.shift() as number;
		if (found.has(pid)) continue;
		found.add(pid);
		queue.push(...(children.get(pid) ?? []));
	}
	return [...found];
}

function capySessionPids(): number[] {
	const panes = sh("tmux", [
		"list-panes",
		"-s",
		"-t",
		CAPY_SESSION,
		"-F",
		"#{pane_pid}",
	]);
	if (panes.code !== 0) return [];
	return descendantPids({
		roots: panes.stdout.split("\n").map(Number).filter(Boolean),
		psOutput: sh("ps", ["-eo", "pid=,ppid="]).stdout,
	});
}

function signalPids({
	pids,
	signal,
}: {
	pids: number[];
	signal: NodeJS.Signals | 0;
}): number[] {
	return pids.filter((pid) => {
		try {
			process.kill(pid, signal);
			return true;
		} catch {
			return false;
		}
	});
}

// nodemon and friends survive the tmux SIGHUP and keep :8080 bound, so the tree is killed explicitly.
export function cmdCapyStop(): void {
	if (!tmuxSessionExists(CAPY_SESSION)) return;
	const pids = capySessionPids();
	sh("tmux", ["kill-session", "-t", CAPY_SESSION]);
	let alive = signalPids({ pids, signal: "SIGTERM" });
	for (let i = 0; i < 40 && alive.length > 0; i++) {
		Bun.sleepSync(250);
		alive = signalPids({ pids: alive, signal: 0 });
	}
	signalPids({ pids: alive, signal: "SIGKILL" });
	rmSync(APP_MODE_PATH, { force: true });
}

export async function cmdCapyRestart({
	args = [],
}: {
	args?: string[];
} = {}): Promise<void> {
	cmdCapyStop();
	await cmdCapy({ args });
}
