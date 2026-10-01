import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { queueCreationRecovery } from "@/internal/customers/recovery/queueCreationRecovery.js";
import { JobName } from "@/queue/JobName.js";
import type {
	EntityCreationRecoveryParams,
	EntityCreationRecoveryStage,
} from "./entityCreationRecoveryTypes.js";

const getDeduplicationId = ({
	ctx,
	params,
	failureStage,
}: {
	ctx: AutumnContext;
	params: EntityCreationRecoveryParams;
	failureStage: EntityCreationRecoveryStage;
}) =>
	`entity-creation-${Bun.hash(
		JSON.stringify({
			orgId: ctx.org.id,
			env: ctx.env,
			apiVersion: ctx.apiVersion.value,
			params,
			failureStage,
		}),
	).toString(16)}`;

export const queueFailedEntityCreation = async ({
	ctx,
	params,
	failureStage,
}: {
	ctx: AutumnContext;
	params: EntityCreationRecoveryParams;
	failureStage: EntityCreationRecoveryStage;
}): Promise<boolean> => {
	const outcome = await queueCreationRecovery({
		ctx,
		jobName: JobName.EntityCreationRecovery,
		messageDeduplicationId: getDeduplicationId({ ctx, params, failureStage }),
		payload: {
			orgId: ctx.org.id,
			env: ctx.env,
			customerId: params.customerId,
			requestId: ctx.id,
			apiVersion: ctx.apiVersion.value,
			params,
			failureStage,
			failedAt: Date.now(),
		},
	});
	if (!outcome.queued) return false;
	ctx.extraLogs.entityCreationRecoveryQueued = {
		failureStage,
		queueUrl: outcome.queueUrl,
	};
	return true;
};
