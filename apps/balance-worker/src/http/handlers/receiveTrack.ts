import { parseTrackCommand } from "@autumn/balance-engine";
import type { BalanceWorkerTrackResponse } from "@autumn/balance-worker-client/protocol";
import type { Context } from "hono";
import type { BalanceWorkerHttpEnv } from "../types/balanceWorkerHttp.js";

export async function receiveTrack(context: Context<BalanceWorkerHttpEnv>) {
	const ctx = context.get("ctx");
	const { command } = context.get("request");
	const parsedCommand = parseTrackCommand({ input: command });
	const requestLog = context.get("requestLog");
	requestLog.command = parsedCommand;
	const decision = await ctx.runtime.submitTrack({ command: parsedCommand });
	requestLog.decision = decision;
	return context.json({ decision } satisfies BalanceWorkerTrackResponse);
}
