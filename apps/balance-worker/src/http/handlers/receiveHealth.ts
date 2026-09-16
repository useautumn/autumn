import type { Context } from "hono";
import type { BalanceWorkerHttpEnv } from "../types/balanceWorkerHttp.js";

export function receiveHealth(context: Context<BalanceWorkerHttpEnv>) {
	return context.json({ status: "alive" });
}
