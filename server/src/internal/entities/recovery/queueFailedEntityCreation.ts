import { entityCreationRecoveryDedupeId } from "@autumn/sqs";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CUSTOMER_CREATION_RECOVERY_MESSAGE_GROUP_ID } from "@/internal/customers/recovery/queueFailedCustomerCreation.js";
import { getSqsJobs } from "@/queue/getSqsJobs.js";
import type {
	EntityCreationRecoveryParams,
	EntityCreationRecoveryPayload,
	EntityCreationRecoveryStage,
} from "./entityCreationRecoveryTypes.js";

/** False, never a throw, when the queue is missing or unreachable: the request's own failure is the answer. */
export const queueFailedEntityCreation = async ({
	ctx,
	params,
	failureStage,
}: {
	ctx: AutumnContext;
	params: EntityCreationRecoveryParams;
	failureStage: EntityCreationRecoveryStage;
}): Promise<boolean> => {
	const payload: EntityCreationRecoveryPayload = {
		orgId: ctx.org.id,
		env: ctx.env,
		customerId: params.customerId,
		requestId: ctx.id,
		apiVersion: ctx.apiVersion.value,
		params,
		failureStage,
		failedAt: Date.now(),
	};
	const { sent } = await getSqsJobs().entityCreationRecovery.trySend(payload, {
		groupId: CUSTOMER_CREATION_RECOVERY_MESSAGE_GROUP_ID,
		dedupeId: entityCreationRecoveryDedupeId({ payload }),
	});
	if (!sent) return false;
	ctx.extraLogs.entityCreationRecoveryQueued = { failureStage };
	return true;
};
