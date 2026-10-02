import {
	creationRecoveryGroupId,
	entityCreationRecoveryDedupeId,
} from "@autumn/sqs";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getSqsJobs } from "@/queue/getSqsJobs.js";
import type {
	EntityCreationRecoveryParams,
	EntityCreationRecoveryPayload,
} from "./entityCreationRecoveryTypes.js";

/** False, never a throw, when the queue is missing or unreachable: the request's own failure is the answer. */
export const queueFailedEntityCreation = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: EntityCreationRecoveryParams;
}): Promise<boolean> => {
	const payload: EntityCreationRecoveryPayload = {
		orgId: ctx.org.id,
		env: ctx.env,
		customerId: params.customerId,
		requestId: ctx.id,
		apiVersion: ctx.apiVersion.value,
		params,
		failedAt: Date.now(),
	};
	const { sent } = await getSqsJobs().entityCreationRecovery.trySend(payload, {
		groupId: creationRecoveryGroupId(payload),
		dedupeId: entityCreationRecoveryDedupeId({ payload }),
	});
	if (!sent) return false;
	ctx.extraLogs.entityCreationRecoveryQueued = true;
	return true;
};
