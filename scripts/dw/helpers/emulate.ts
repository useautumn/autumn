import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
	EMULATE_PID_FILE,
	PROJECT_ROOT,
	START_EMULATE_SH,
} from "../constants.ts";
import { isHeadless } from "./headless.ts";
import { EMULATE_PORT, portlessHttpsUrl } from "./ports.ts";
import { log, sh } from "./shell.ts";

const EMULATE_LOG = join(homedir(), ".autumn-emulate.log");

/** Public folder for path-proxy; local loopback for headless without ngrok. */
export function emulateGoogleUrl({
	origin,
}: {
	origin?: string;
}): string {
	if (origin?.startsWith("https://")) {
		return `${origin.replace(/\/$/, "")}/emulate`;
	}
	if (isHeadless()) {
		return `http://127.0.0.1:${EMULATE_PORT}`;
	}
	return portlessHttpsUrl("google.emulate.localhost");
}

function emulateReachable({ baseUrl }: { baseUrl: string }): boolean {
	const healthUrl = `${baseUrl.replace(/\/$/, "")}/.well-known/openid-configuration`;
	const res = sh("curl", [
		"-sf",
		"-o",
		"/dev/null",
		"--max-time",
		"1",
		healthUrl,
	]);
	return res.code === 0;
}

function ensureEmulateBinary(): boolean {
	if (sh("bash", ["-lc", "command -v emulate"]).code === 0) return true;
	log("installing emulate globally via bun");
	return sh("bun", ["install", "-g", "emulate"]).code === 0;
}

/** Laptop: portless HTTPS. Cloud: plain HTTP on EMULATE_PORT (path-proxied). */
export function ensureEmulateRunning({
	origin,
}: {
	origin?: string;
} = {}): void {
	if (isHeadless()) {
		ensureHeadlessEmulateRunning({ origin });
		return;
	}
	const baseUrl = emulateGoogleUrl({});
	if (emulateReachable({ baseUrl })) return;
	log("emulate.dev not reachable, spawning daemon");
	const res = sh("bash", [START_EMULATE_SH]);
	if (res.code !== 0) {
		console.error(
			`[dw] failed to start emulate daemon:\n${res.stdout}\n${res.stderr}`,
		);
	}
}

function ensureHeadlessEmulateRunning({
	origin,
}: {
	origin?: string;
}): void {
	const loopback = `http://127.0.0.1:${EMULATE_PORT}`;
	if (emulateReachable({ baseUrl: loopback })) return;
	if (!ensureEmulateBinary()) {
		console.error("[dw] emulate binary missing; Google sign-in will hit real Google");
		return;
	}

	const seed = join(PROJECT_ROOT, "emulate.config.yaml");
	const publicBase = origin?.startsWith("https://")
		? emulateGoogleUrl({ origin })
		: loopback;
	log(`starting google emulate on :${EMULATE_PORT} (base ${publicBase})`);

	const proc = Bun.spawn(
		[
			"emulate",
			"start",
			"-p",
			String(EMULATE_PORT),
			"-s",
			"google",
			"--seed",
			seed,
			"--base-url",
			publicBase,
		],
		{
			cwd: PROJECT_ROOT,
			stdout: "pipe",
			stderr: "pipe",
			stdin: "ignore",
		},
	);
	writeFileSync(EMULATE_PID_FILE, `${proc.pid}\n`);
	void proc.exited.then(async (code) => {
		const out = await new Response(proc.stdout).text();
		const err = await new Response(proc.stderr).text();
		writeFileSync(EMULATE_LOG, `${out}\n${err}\nexit=${code}\n`);
	});

	for (let i = 0; i < 30; i++) {
		if (emulateReachable({ baseUrl: loopback })) {
			log(`emulate ready at ${loopback}`);
			return;
		}
		Bun.sleepSync(300);
	}
	console.error(
		`[dw] headless emulate failed to come up on :${EMULATE_PORT}; see ${EMULATE_LOG}`,
	);
}

export function killPidFromFile(file: string): boolean {
	if (!existsSync(file)) return false;
	const pid = Number(readFileSync(file, "utf-8").trim());
	if (!pid || Number.isNaN(pid)) return false;
	try {
		process.kill(pid, "SIGTERM");
	} catch {}
	rmSync(file, { force: true });
	return true;
}

export function killHostProcessByName(name: string): boolean {
	const res = sh("pgrep", ["-f", name]);
	const pids = res.stdout
		.split("\n")
		.map((s) => s.trim())
		.filter(Boolean)
		.filter((s) => /^\d+$/.test(s));
	if (pids.length === 0) return false;
	for (const pid of pids) {
		try {
			process.kill(Number(pid), "SIGTERM");
		} catch {}
	}
	return true;
}

export function stopEmulateAndPortless(): void {
	const fromPid = killPidFromFile(EMULATE_PID_FILE);
	const fromScan =
		killHostProcessByName("emulate --portless") ||
		killHostProcessByName(`emulate start -p ${EMULATE_PORT}`);
	if (fromPid || fromScan) log("stopped emulate.dev");
	if (!isHeadless()) {
		const stop = sh("portless", ["proxy", "stop"]);
		if (stop.code === 0) log("stopped portless proxy");
	}
}
