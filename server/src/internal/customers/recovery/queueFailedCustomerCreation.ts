import type { BillingDetailsParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { JobName } from "@/queue/JobName.js";
import type {
	CustomerCreationRecoveryParams,
	CustomerCreationRecoveryStage,
} from "./customerCreationRecoveryTypes.js";
import { queueCreationRecovery } from "./queueCreationRecovery.js";

const getDeduplicationId = ({
	ctx,
	params,
	billingDetails,
	withAutumnId,
	failureStage,
}: {
	ctx: AutumnContext;
	params: CustomerCreationRecoveryParams;
	billingDetails?: BillingDetailsParams;
	withAutumnId?: boolean;
	failureStage: CustomerCreationRecoveryStage;
}) =>
	`customer-creation-${Bun.hash(
		JSON.stringify({
			orgId: ctx.org.id,
			env: ctx.env,
			apiVersion: ctx.apiVersion.value,
			params,
			billingDetails,
			withAutumnId,
			failureStage,
		}),
	).toString(16)}`;

export const queueFailedCustomerCreation = async ({
	ctx,
	params,
	billingDetails,
	source,
	withAutumnId,
	failureStage,
}: {
	ctx: AutumnContext;
	params: CustomerCreationRecoveryParams;
	billingDetails?: BillingDetailsParams;
	source?: string;
	withAutumnId?: boolean;
	failureStage: CustomerCreationRecoveryStage;
}): Promise<boolean> => {
	const outcome = await queueCreationRecovery({
		ctx,
		jobName: JobName.CustomerCreationRecovery,
		messageDeduplicationId: getDeduplicationId({
			ctx,
			params,
			billingDetails,
			withAutumnId,
			failureStage,
		}),
		payload: {
			orgId: ctx.org.id,
			env: ctx.env,
			customerId: params.customer_id ?? undefined,
			requestId: ctx.id,
			apiVersion: ctx.apiVersion.value,
			params,
			billingDetails,
			source,
			withAutumnId,
			failureStage,
			failedAt: Date.now(),
		},
	});
	if (!outcome.queued) return false;
	ctx.extraLogs.customerCreationRecoveryQueued = {
		failureStage,
		queueUrl: outcome.queueUrl,
	};
	return true;
};
