import { ApiVersionClass } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getOrCreateApiCustomerByRollout } from "@/internal/customers/actions/getOrCreateApiCustomerByRollout.js";
import type { CustomerCreationRecoveryPayload } from "./customerCreationRecoveryTypes.js";

export const replayFailedCustomerCreation = async ({
	ctx,
	payload,
}: {
	ctx: AutumnContext;
	payload: CustomerCreationRecoveryPayload;
}) => {
	if (payload.failureStage === "autumn_committed") {
		throw new Error(
			`Customer creation recovery ${payload.requestId} requires manual billing review`,
		);
	}

	ctx.apiVersion = new ApiVersionClass(payload.apiVersion);

	await getOrCreateApiCustomerByRollout({
		ctx,
		params: payload.params,
		source: "customerCreationRecovery",
		withAutumnId: payload.withAutumnId,
		enqueueRecoveryOnTransientFailure: false,
	});

	const outcome =
		ctx.extraLogs.autumnPlanResult === "created" ? "created" : "fetched";
	ctx.extraLogs.customerCreationRecoveryReplay = {
		outcome,
		sourceRequestId: payload.requestId,
		failureStage: payload.failureStage,
	};
	ctx.logger.info("[customerCreationRecovery] Replay completed", {
		outcome,
		sourceRequestId: payload.requestId,
		failureStage: payload.failureStage,
	});
};
