import type { BalanceWorkerClient } from "@autumn/balance-worker-client";
import type { CheckParams, CheckResponseV3 } from "@autumn/shared";
import { getBalanceWorkerClient } from "@/external/balanceWorker/getBalanceWorkerClient.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { rethrowBalanceWorkerError } from "../../balanceWorker/balanceWorkerErrors.js";
import { parseCheckParamsForLock } from "../../utils/lock/parseCheckParamsForLock.js";
import { checkAnswerToApiResponse } from "./balanceWorkerCheckReply.js";
import { checkParamsToCheckCommand } from "./balanceWorkerCheckRequest.js";
import { runDeductingCheck } from "./runDeductingCheck.js";

/** One worker call per check: a read when it only asks, a track when it also deducts. */
export async function runBalanceWorkerCheck({
	ctx,
	body: rawBody,
	client = getBalanceWorkerClient(),
}: {
	ctx: AutumnContext;
	body: CheckParams;
	client?: Pick<BalanceWorkerClient, "check" | "track">;
}): Promise<CheckResponseV3> {
	// Validates the lock, gives it an id when the caller sent none, and drops a disabled one.
	const body = parseCheckParamsForLock({ params: rawBody });
	const command = checkParamsToCheckCommand({ ctx, body });
	const deducts = body.send_event === true || body.lock !== undefined;
	try {
		const answer = deducts
			? await runDeductingCheck({ ctx, body, client })
			: await client.check({ command });
		return checkAnswerToApiResponse({ ctx, command, answer });
	} catch (cause) {
		rethrowBalanceWorkerError({ cause });
	}
}
