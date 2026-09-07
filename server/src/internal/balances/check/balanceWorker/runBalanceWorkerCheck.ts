import type { BalanceWorkerClient } from "@autumn/balance-worker-client";
import type { CheckParams, CheckResponseV3 } from "@autumn/shared";
import { getBalanceWorkerClient } from "@/external/balanceWorker/getBalanceWorkerClient.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { rethrowBalanceWorkerError } from "../../balanceWorker/balanceWorkerErrors.js";
import { checkParamsToCheckCommand } from "./balanceWorkerCheckRequest.js";
import { checkDecisionToCheckResponse } from "./balanceWorkerCheckResponse.js";

export async function runBalanceWorkerCheck({
	ctx,
	body,
	client,
}: {
	ctx: AutumnContext;
	body: CheckParams;
	client?: Pick<BalanceWorkerClient, "check">;
}): Promise<CheckResponseV3> {
	const command = checkParamsToCheckCommand({ ctx, body });
	try {
		const decision = await (client ?? getBalanceWorkerClient()).check({
			command,
		});
		return checkDecisionToCheckResponse({ ctx, command, decision });
	} catch (cause) {
		rethrowBalanceWorkerError({ cause });
	}
}
