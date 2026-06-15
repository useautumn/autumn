import { logger } from "../../lib/logger.js";

const BENIGN_CODES = new Set([
	"ECONNRESET",
	"EPIPE",
	"ECONNABORTED",
	"ERR_STREAM_PREMATURE_CLOSE",
]);

// Under Bun, the claude-code bridge WebSocket surfaces its 'error' as an
// ErrorEvent that the harness's `.on('error')` listener doesn't catch; E2B's host
// proxy emits it on teardown (Vercel/Daytona close cleanly, so they never hit
// this). The turn already completed by then, so the error is teardown noise.
const isBenignBridgeWsError = (error: unknown): boolean => {
	if (error == null || typeof error !== "object") return false;
	const value = error as {
		constructor?: { name?: string };
		type?: string;
		code?: string;
		error?: { code?: string };
	};
	if (value.constructor?.name === "ErrorEvent" || value.type === "error") {
		return true;
	}
	const code = value.code ?? value.error?.code;
	return code != null && BENIGN_CODES.has(code);
};

let installed = false;

/**
 * Swallow the benign bridge-WebSocket teardown error so it can't kill the host
 * process; preserve normal crash semantics for every other uncaught error.
 * Installed only when the E2B provider runs, so other harnesses are unaffected.
 */
export const installBridgeWsErrorGuard = (): void => {
	if (installed) return;
	installed = true;
	process.on("uncaughtException", (error) => {
		if (isBenignBridgeWsError(error)) {
			logger.warn("Swallowed benign E2B bridge WebSocket error", {
				event: "leaf.e2b_bridge_ws_error_swallowed",
				data: { message: String((error as Error)?.message ?? error) },
			});
			return;
		}
		logger.error("Uncaught exception", error as Error, {
			event: "leaf.uncaught_exception",
		});
		process.exit(1);
	});
};
