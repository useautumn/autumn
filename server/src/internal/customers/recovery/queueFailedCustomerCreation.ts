import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { JobName } from "@/queue/JobName.js";
import { addTaskToQueue } from "@/queue/queueUtils.js";
import type {
	CustomerCreationRecoveryParams,
	CustomerCreationRecoveryStage,
} from "./customerCreationRecoveryTypes.js";

export const CUSTOMER_CREATION_RECOVERY_MESSAGE_GROUP_ID =
	"customer-creation-recovery";

const getDeduplicationId = ({
	ctx,
	params,
	withAutumnId,
	failureStage,
}: {
	ctx: AutumnContext;
	params: CustomerCreationRecoveryParams;
	withAutumnId?: boolean;
	failureStage: CustomerCreationRecoveryStage;
}) =>
	`customer-creation-${Bun.hash(
		JSON.stringify({
			orgId: ctx.org.id,
			env: ctx.env,
			apiVersion: ctx.apiVersion.value,
			params,
			withAutumnId,
			failureStage,
		}),
	).toString(16)}`;

export const queueFailedCustomerCreation = async ({
	ctx,
	params,
	source,
	withAutumnId,
	failureStage,
}: {
	ctx: AutumnContext;
	params: CustomerCreationRecoveryParams;
	source?: string;
	withAutumnId?: boolean;
	failureStage: CustomerCreationRecoveryStage;
}): Promise<boolean> => {
	const queueUrl = process.env.CUSTOMER_CREATION_RECOVERY_SQS_QUEUE_URL;
	if (!queueUrl) {
		ctx.logger.error(
			"[customerCreationRecovery] Recovery queue URL is not configured",
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
				withAutumnId,
				failureStage,
			}),
			generateDeduplicationId: false,
			payload: {
				orgId: ctx.org.id,
				env: ctx.env,
				customerId: params.customer_id ?? undefined,
				requestId: ctx.id,
				apiVersion: ctx.apiVersion.value,
				params,
				source,
				withAutumnId,
				failureStage,
				failedAt: Date.now(),
			},
		});
		ctx.extraLogs.customerCreationRecoveryQueued = {
			failureStage,
			queueUrl,
		};
		return true;
	} catch (error) {
		ctx.logger.error(
			"[customerCreationRecovery] Failed to enqueue customer creation recovery",
			{ error, failureStage },
		);
		return false;
	}
};
