import type { BalanceWorkerClient } from "@autumn/balance-worker-client";
import type { CheckParams, CheckResponseV3 } from "@autumn/shared";
import { getBalanceWorkerClient } from "@/external/balanceWorker/getBalanceWorkerClient.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { rethrowBalanceWorkerError } from "../../balanceWorker/balanceWorkerErrors.js";
import { loadBalanceWorkerSubject } from "../../balanceWorker/loadBalanceWorkerSubject.js";
import { checkReplyToApiResponse } from "./balanceWorkerCheckReply.js";
import { checkParamsToCheckCommand } from "./balanceWorkerCheckRequest.js";

export async function runBalanceWorkerCheck({
	ctx,
	body,
	client,
	loadSubject = loadBalanceWorkerSubject,
}: {
	ctx: AutumnContext;
	body: CheckParams;
	client?: Pick<BalanceWorkerClient, "check">;
	loadSubject?: typeof loadBalanceWorkerSubject;
}): Promise<CheckResponseV3> {
	const command = checkParamsToCheckCommand({ ctx, body });
	try {
		const reply = await (client ?? getBalanceWorkerClient()).check({
			command,
		});
		const fullSubject = await loadSubject({
			ctx,
			customerId: body.customer_id,
			entityId: body.entity_id,
		});
		return checkReplyToApiResponse({ ctx, command, reply, fullSubject });
	} catch (cause) {
		rethrowBalanceWorkerError({ cause });
	}
}
