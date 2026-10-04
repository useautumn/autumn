import type {
	ServerCpuFrame,
	ServerCpuPhase,
} from "./types/serverCpuProfile.js";

export function classifyServerCpuSample({
	frames,
}: {
	frames: ServerCpuFrame[];
}): ServerCpuPhase {
	for (const frame of frames) {
		const path = frame.sourceURL ?? "";
		if (
			path.includes("/profiling/serverCpu/") ||
			path.includes("/memory/serverEventLoopMonitor.")
		)
			return "unattributed";
		if (
			frame.name === "redactSensitiveRequestBody" &&
			path.includes("/honoMiddlewares/baseMiddleware.")
		)
			return "logging";
		if (
			path.includes("/packages/logging/") ||
			path.includes("/honoMiddlewares/requestLogging/") ||
			path.includes("/utils/logging/") ||
			path.includes("/external/logtail/")
		)
			return "logging";
		if (
			path.includes("/packages/balance-worker-client/") ||
			path.includes("/external/balanceWorker/")
		)
			return "balanceWorkerClient";
		if (
			path.includes("/packages/auth/") ||
			path.includes("/internal/dev/apiKeys/") ||
			path.includes("/actions/secretKeyCache/")
		)
			return "auth";
		if (
			path.includes("/node_modules/hono/") &&
			(frame.name === "json" ||
				frame.name === "#newResponse" ||
				frame.name === "newResponse")
		)
			return "serialization";
		if (!path.includes("/server/src/")) continue;
		if (
			path.includes("/honoMiddlewares/secretKeyMiddleware.") ||
			path.includes("/honoMiddlewares/authMiddlewares/") ||
			path.includes("/honoMiddlewares/publicKeyMiddleware.") ||
			path.includes("/honoMiddlewares/customerJwtMiddleware.")
		)
			return "auth";
		if (path.includes("/honoMiddlewares/responseFilter/"))
			return "serialization";
		if (
			path.includes("/honoMiddlewares/") ||
			path.includes("/initHono.") ||
			path.includes("/internal/misc/rateLimiter/")
		)
			return "routing";
		return "unattributed";
	}
	return "unattributed";
}
