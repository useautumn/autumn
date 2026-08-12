import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CUSTOMER_CREATION_RECOVERY_MESSAGE_GROUP_ID } from "@/internal/customers/recovery/queueFailedCustomerCreation.js";
import { JobName } from "@/queue/JobName.js";
import { addTaskToQueue } from "@/queue/queueUtils.js";
import type { EntityCreationRecoveryPayload } from "./entityCreationRecoveryTypes.js";

export const queueFailedEntityCreation = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: EntityCreationRecoveryPayload["params"];
}) => {
	const queueUrl = process.env.CUSTOMER_CREATION_RECOVERY_SQS_QUEUE_URL;
	if (!queueUrl) {
		ctx.logger.error(
			"[entityCreationRecovery] Recovery queue URL is not configured",
		);
		return false;
	}
	try {
		await addTaskToQueue({
			jobName: JobName.CustomerCreationRecovery,
			queueUrl,
			messageGroupId: CUSTOMER_CREATION_RECOVERY_MESSAGE_GROUP_ID,
			messageDeduplicationId: `entity-creation-${Bun.hash(
				JSON.stringify({
					orgId: ctx.org.id,
					env: ctx.env,
					apiVersion: ctx.apiVersion.value,
					params,
				}),
			).toString(16)}`,
			generateDeduplicationId: false,
			payload: {
				kind: "entity",
				orgId: ctx.org.id,
				env: ctx.env,
				customerId: params.customer_id,
				requestId: ctx.id,
				apiVersion: ctx.apiVersion.value,
				params,
			},
		});
		ctx.extraLogs.entityCreationRecoveryQueued = { queueUrl };
		return true;
	} catch (error) {
		ctx.logger.error(
			"[entityCreationRecovery] Failed to enqueue entity creation recovery",
			{ error },
		);
		return false;
	}
};
