import { Hono } from "hono";
import { createWorkerErrorHandler } from "./handlers/errorHandler/createWorkerErrorHandler.js";
import { receiveHealth } from "./handlers/receiveHealth.js";
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
	app.post(
		"/v1/track",
		requestValidationMiddleware,
		runtimeRoutingMiddleware({ ctx }),
		receiveTrack,
	);
	return app;
}
