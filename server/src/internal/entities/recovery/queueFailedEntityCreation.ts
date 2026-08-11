import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CUSTOMER_CREATION_RECOVERY_MESSAGE_GROUP_ID } from "@/internal/customers/recovery/queueFailedCustomerCreation.js";
import { JobName } from "@/queue/JobName.js";
import { addTaskToQueue } from "@/queue/queueUtils.js";
import type { EntityCreationRecoveryParams } from "./entityCreationRecoveryTypes.js";

const getDeduplicationId = ({
	ctx,
	params,
	mayHaveWritten,
}: {
	ctx: AutumnContext;
	params: EntityCreationRecoveryParams;
	mayHaveWritten: boolean;
}) =>
	`entity-creation-${Bun.hash(
		JSON.stringify({
			orgId: ctx.org.id,
			env: ctx.env,
			apiVersion: ctx.apiVersion.value,
			params,
			mayHaveWritten,
			// Two attempts that each part-wrote are two reconciliations. Collapsing
			// them on identical params would hide one from review.
			...(mayHaveWritten && { requestId: ctx.id }),
		}),
	).toString(16)}`;

export const queueFailedEntityCreation = async ({
	ctx,
	params,
	mayHaveWritten,
}: {
	ctx: AutumnContext;
	params: EntityCreationRecoveryParams;
	mayHaveWritten: boolean;
}): Promise<boolean> => {
	// Shares the customer creation recovery queue: an entity can only be created
	// once its customer exists, so both replay under one FIFO group at a
	// concurrency ceiling of one, behind one edge-config drain switch.
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
			messageDeduplicationId: getDeduplicationId({
				ctx,
				params,
				mayHaveWritten,
			}),
			generateDeduplicationId: false,
			payload: {
				kind: "entity",
				orgId: ctx.org.id,
				env: ctx.env,
				customerId: params.customer_id,
				requestId: ctx.id,
				apiVersion: ctx.apiVersion.value,
				params,
				mayHaveWritten,
			},
		});
		ctx.extraLogs.entityCreationRecoveryQueued = { queueUrl, mayHaveWritten };
		return true;
	} catch (error) {
		ctx.logger.error(
			"[entityCreationRecovery] Failed to enqueue entity creation recovery",
			{ error },
		);
		return false;
	}
};
