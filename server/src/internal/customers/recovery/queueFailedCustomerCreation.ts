import type { BillingDetailsParams } from "@autumn/shared";
import { customerCreationRecoveryDedupeId } from "@autumn/sqs";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getSqsJobs } from "@/queue/getSqsJobs.js";
import type {
	CustomerCreationRecoveryParams,
	CustomerCreationRecoveryPayload,
	CustomerCreationRecoveryStage,
} from "./customerCreationRecoveryTypes.js";

/** One group for every creation replay: a hard concurrency ceiling of one, in failure order. */
export const CUSTOMER_CREATION_RECOVERY_MESSAGE_GROUP_ID =
	"customer-creation-recovery";

/** False, never a throw, when the queue is missing or unreachable: the request's own failure is the answer. */
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
	const payload: CustomerCreationRecoveryPayload = {
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
	};
	const { sent } = await getSqsJobs().customerCreationRecovery.trySend(
		payload,
		{
			groupId: CUSTOMER_CREATION_RECOVERY_MESSAGE_GROUP_ID,
			dedupeId: customerCreationRecoveryDedupeId({ payload }),
		},
	);
	if (!sent) return false;
	ctx.extraLogs.customerCreationRecoveryQueued = { failureStage };
	return true;
};
