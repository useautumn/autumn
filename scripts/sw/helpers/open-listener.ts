import { OPEN_LISTENER, SW_OPEN_SOCK } from "../constants.ts";
import { sh } from "./shell.ts";

/**
 * Ensure the Mac-side URL-open listener is running (idempotent). The box's
 * xdg-open shim reverse-forwards non-local URLs to SW_OPEN_SOCK; this listener
 * opens them in your local browser. Detached so it outlives `bun sw`.
 */
export function ensureOpenListener(): void {
	const probe = sh("python3", [
		"-c",
		`import socket; socket.socket(socket.AF_UNIX).connect(${JSON.stringify(SW_OPEN_SOCK)})`,
	]);
	if (probe.code === 0) return; // already listening
	sh("bash", [
		"-c",
		`nohup python3 ${JSON.stringify(OPEN_LISTENER)} ${JSON.stringify(SW_OPEN_SOCK)} >/dev/null 2>&1 &`,
	]);
}
