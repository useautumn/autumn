import { parseTrackCommand } from "@autumn/balance-engine";
import type { TrackResponse } from "@autumn/balance-worker-protocol";
import type { Context } from "hono";
import type { BalanceWorkerHttpEnv } from "../types/balanceWorkerHttp.js";

export async function receiveTrack(context: Context<BalanceWorkerHttpEnv>) {
	const ctx = context.get("ctx");
	const { command } = context.get("request");
	const parsedCommand = parseTrackCommand({ input: command });
	const decision = await ctx.runtime.submitTrack({ command: parsedCommand });
	return context.json({ decision } satisfies TrackResponse);
}
