import { existsSync, readFileSync, rmSync } from "node:fs";
import { EMULATE_PID_FILE, START_EMULATE_SH } from "../constants.ts";
import { isAmicable } from "./amicable.ts";
import { portlessHttpsUrl } from "./ports.ts";
import { log, sh } from "./shell.ts";

export function emulateGoogleUrl(): string {
	return isAmicable()
		? "http://localhost:4000"
		: portlessHttpsUrl("google.emulate.localhost");
}

function emulateReachable(): boolean {
	const healthUrl = `${emulateGoogleUrl()}/.well-known/openid-configuration`;
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

export function ensureEmulateRunning(): void {
	if (emulateReachable()) return;
	log("emulate.dev not reachable, spawning daemon");
	const res = sh("bash", [START_EMULATE_SH]);
	if (res.code !== 0) {
		console.error(
			`[dw] failed to start emulate daemon:\n${res.stdout}\n${res.stderr}`,
		);
	}
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
		killHostProcessByName("emulate start");
	if (fromPid || fromScan) log("stopped emulate.dev");
	if (isAmicable()) return;
	const stop = sh("portless", ["proxy", "stop"]);
	if (stop.code === 0) log("stopped portless proxy");
}
