// LEGACY: Local emulate.dev daemon, kept for manual use only. The active OAuth
// emulator is hosted at https://emulate-vercel.vercel.app/emulate/google (see
// `EMULATE_GOOGLE_URL` in env files). Nothing in the `bun dw` flow calls
// `ensureEmulateRunning` anymore — invoke `scripts/setup/start-emulate.sh` by
// hand if you need to run it locally.
import { existsSync, readFileSync, rmSync } from "node:fs";
import { sh, log } from "./shell.ts";
import {
	EMULATE_PID_FILE,
	EMULATE_HEALTH_URL,
	START_EMULATE_SH,
} from "../constants.ts";

function emulateReachable(): boolean {
	const res = sh("curl", [
		"-sf",
		"-o",
		"/dev/null",
		"--max-time",
		"1",
		EMULATE_HEALTH_URL,
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

export function stopPortlessProxy(): void {
	const stop = sh("portless", ["proxy", "stop"]);
	if (stop.code === 0) log("stopped portless proxy");
}

// LEGACY: only stops the local daemon if one happens to be running. Safe to
// call at teardown to reclaim port 443; otherwise a no-op.
export function stopLocalEmulateIfRunning(): void {
	const fromPid = killPidFromFile(EMULATE_PID_FILE);
	const fromScan = killHostProcessByName("emulate --portless");
	if (fromPid || fromScan) log("stopped local emulate.dev");
}
