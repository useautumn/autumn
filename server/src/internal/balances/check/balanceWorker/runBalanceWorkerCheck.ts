import type { CheckCommand } from "@autumn/balance-engine";
import type {
	BalanceWorkerClient,
	CheckReply,
} from "@autumn/balance-worker-client";
import {
	type CheckParams,
	type CheckResponseV3,
	ErrCode,
	RecaseError,
} from "@autumn/shared";
import { getBalanceWorkerClient } from "@/external/balanceWorker/getBalanceWorkerClient.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { rethrowBalanceWorkerError } from "../../balanceWorker/balanceWorkerErrors.js";
import { loadBalanceWorkerSubject } from "../../balanceWorker/loadBalanceWorkerSubject.js";
import { trackParamsToTrackCommand } from "../../track/balanceWorker/balanceWorkerTrackRequest.js";
import { checkReplyToApiResponse } from "./balanceWorkerCheckReply.js";
import { checkParamsToCheckCommand } from "./balanceWorkerCheckRequest.js";

type CheckClient = Pick<BalanceWorkerClient, "check" | "track">;

/** `send_event`: an allowed check is followed by a reject-mode track of the same amount; a lost race answers not allowed. */
const trackAllowedCheck = async ({
	ctx,
	body,
	client,
	checkReply,
}: {
	ctx: AutumnContext;
	body: CheckParams;
	client: CheckClient;
	checkReply: CheckReply;
}): Promise<CheckReply> => {
	if (checkReply.result.isFlag)
		throw new RecaseError({
			message:
				"send_event cannot be used with boolean features, which are flags rather than usage-tracked.",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	const trackReply = await client.track({
		command: trackParamsToTrackCommand({
			ctx,
			body: {
				customer_id: body.customer_id,
				entity_id: body.entity_id,
				feature_id: body.feature_id,
				value: body.required_balance ?? body.required_quantity ?? 1,
				properties: body.properties,
				overage_behavior: "reject",
			},
		}),
	});
	const allowed = trackReply.result.status === "applied";
	return {
		result: {
			...checkReply.result,
			allowed,
			reason: allowed ? null : "insufficient_balance",
		},
		state: trackReply.state,
	};
};

export async function runBalanceWorkerCheck({
	ctx,
	body,
	client = getBalanceWorkerClient(),
	loadSubject = loadBalanceWorkerSubject,
}: {
	ctx: AutumnContext;
	body: CheckParams;
	client?: CheckClient;
	loadSubject?: typeof loadBalanceWorkerSubject;
}): Promise<CheckResponseV3> {
	const command: CheckCommand = checkParamsToCheckCommand({ ctx, body });
	try {
		const checkReply = await client.check({ command });
		const reply =
			body.send_event && checkReply.result.allowed
				? await trackAllowedCheck({ ctx, body, client, checkReply })
				: checkReply;
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
