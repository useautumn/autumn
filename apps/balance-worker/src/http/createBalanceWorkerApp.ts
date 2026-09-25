import { Hono } from "hono";
import { createWorkerErrorHandler } from "./handlers/errorHandler/createWorkerErrorHandler.js";
import { receiveApplyBillingPlan } from "./handlers/receiveApplyBillingPlan.js";
import { receiveCheck } from "./handlers/receiveCheck.js";
import { receiveConfirmExpiredLock } from "./handlers/receiveConfirmExpiredLock.js";
import { receiveDeleteBalance } from "./handlers/receiveDeleteBalance.js";
import { receiveEvict } from "./handlers/receiveEvict.js";
import { receiveFinalize } from "./handlers/receiveFinalize.js";
import { receiveFlush } from "./handlers/receiveFlush.js";
import { receiveHealth } from "./handlers/receiveHealth.js";
import { receiveInitialize } from "./handlers/receiveInitialize.js";
import { receiveReadSubjectState } from "./handlers/receiveReadSubjectState.js";
import { receiveRecalculateBalance } from "./handlers/receiveRecalculateBalance.js";
import { receiveReset } from "./handlers/receiveReset.js";
import { receiveTrack } from "./handlers/receiveTrack.js";
import { receiveUpdateBalance } from "./handlers/receiveUpdateBalance.js";
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
	commands.post("/apply-billing-plan", receiveApplyBillingPlan);
	commands.post("/read-subject-state", receiveReadSubjectState);
	commands.post("/track", receiveTrack);
	commands.post("/evict", receiveEvict);
	commands.post("/flush", receiveFlush);
	commands.post("/finalize", receiveFinalize);
	commands.post("/confirm-expired-lock", receiveConfirmExpiredLock);
	commands.post("/reset", receiveReset);
	commands.post("/update-balance", receiveUpdateBalance);
	commands.post("/delete-balance", receiveDeleteBalance);
	commands.post("/recalculate-balance", receiveRecalculateBalance);
	app.route("/v1", commands);
	return app;
}
