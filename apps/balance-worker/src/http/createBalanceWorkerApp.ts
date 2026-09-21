import { Hono } from "hono";
import { createWorkerErrorHandler } from "./handlers/errorHandler/createWorkerErrorHandler.js";
import { receiveCheck } from "./handlers/receiveCheck.js";
import { receiveEvict } from "./handlers/receiveEvict.js";
import { receiveHealth } from "./handlers/receiveHealth.js";
import { receiveInitialize } from "./handlers/receiveInitialize.js";
import { receiveTrack } from "./handlers/receiveTrack.js";
import { requestLoggingMiddleware } from "./middlewares/requestLoggingMiddleware.js";
import { requestValidationMiddleware } from "./middlewares/requestValidationMiddleware.js";
import { runtimeRoutingMiddleware } from "./middlewares/runtimeRouting/runtimeRoutingMiddleware.js";
import type {
	BalanceWorkerHttpContext,
	BalanceWorkerHttpEnv,
} from "./types/balanceWorkerHttp.js";

export function createBalanceWorkerApp({
	ctx,
}: {
	ctx: BalanceWorkerHttpContext;
}) {
	const app = new Hono<BalanceWorkerHttpEnv>();
	app.use(requestLoggingMiddleware({ ctx }));
	app.onError(createWorkerErrorHandler());
	app.get("/health", receiveHealth);
	// Every command shares one entry: parse the envelope, then route it to the partition's runtime.
	const commands = new Hono<BalanceWorkerHttpEnv>();
	commands.use(requestValidationMiddleware, runtimeRoutingMiddleware({ ctx }));
	commands.post("/initialize", receiveInitialize);
	commands.post("/check", receiveCheck);
	commands.post("/track", receiveTrack);
	commands.post("/evict", receiveEvict);
	app.route("/v1", commands);
	return app;
}
