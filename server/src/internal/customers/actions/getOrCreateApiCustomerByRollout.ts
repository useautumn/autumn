import type {
	BillingDetailsParams,
	CheckParams,
	TrackParams,
} from "@autumn/shared";
import { shed503OnTransientError } from "@/db/shed503OnTransientError.js";
import { assertBillingDetailsWritable } from "@/external/stripe/customers/billingDetails/utils/assertBillingDetailsWritable.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { readBalanceWorkerSubject } from "@/internal/balanceWorker/subject/readBalanceWorkerSubject.js";
import { withCreateIfMissing } from "@/internal/balanceWorker/subject/withCreateIfMissing.js";
import { getOrCreateCachedFullSubject } from "@/internal/customers/cache/fullSubject/index.js";
import {
	getCustomerCreationRecoveryStage,
	setCustomerCreationRecoveryStage,
} from "@/internal/customers/recovery/customerCreationRecoveryStage.js";
import { queueFailedCustomerCreation } from "@/internal/customers/recovery/queueFailedCustomerCreation.js";
import { isRedisFallbackToDbEnabled } from "@/internal/misc/miscellaneousEdgeConfig/miscellaneousEdgeConfigStore.js";
import { isBalanceWorkerRolloutEnabled } from "@/internal/misc/rollouts/isBalanceWorkerRolloutEnabled.js";
import { getApiCustomerV2 } from "../cusUtils/getApiCustomerV2/index.js";
import { ensureStripeCustomerFromCustomerData } from "./ensureStripeCustomerFromCustomerData.js";

export const getOrCreateApiCustomerByRollout = async ({
	ctx,
	params,
	billingDetails,
	source,
	withAutumnId,
	enqueueRecoveryOnTransientFailure = true,
	disableReplicaRead = false,
}: {
	ctx: AutumnContext;
	params: Omit<TrackParams | CheckParams, "customer_id"> & {
		customer_id: string | null;
	};
	billingDetails?: BillingDetailsParams;
	source?: string;
	withAutumnId?: boolean;
	enqueueRecoveryOnTransientFailure?: boolean;
	disableReplicaRead?: boolean;
}) => {
	if (billingDetails) assertBillingDetailsWritable({ ctx });

	// The worker is keyed by customer id; an id-less customer stays on Postgres.
	if (
		params.customer_id &&
		isBalanceWorkerRolloutEnabled({ ctx, customerId: params.customer_id })
	) {
		const customerId = params.customer_id;
		const entityId = params.entity_id;
		const fullSubject = await withCreateIfMissing({
			ctx,
			customerId,
			customerData: params.customer_data,
			billingDetails,
			entityId,
			entityData: params.entity_data,
			run: async () => {
				const subject = await readBalanceWorkerSubject({
					ctx,
					customerId,
					entityId,
				});
				return { result: subject, customer: subject.customer };
			},
		});
		return getApiCustomerV2({ ctx, fullSubject, withAutumnId });
	}

	setCustomerCreationRecoveryStage({ ctx, stage: "lookup" });

	const lookup = ({ skipCache }: { skipCache: boolean }) =>
		getOrCreateCachedFullSubject({
			// Sole replica grant; writers opt out via disableReplicaRead.
			readFrom: disableReplicaRead ? "primary" : "replica-ok",
			ctx: skipCache ? { ...ctx, skipCache: true } : ctx,
			params,
			source,
		});

	const fullSubject = await shed503OnTransientError({
		ctx,
		source: "get_or_create",
		run: () => lookup({ skipCache: false }),
		fallbackOnRedisUnavailable: isRedisFallbackToDbEnabled()
			? () => lookup({ skipCache: true })
			: undefined,
		onTransientError: enqueueRecoveryOnTransientFailure
			? async () => {
					await queueFailedCustomerCreation({
						ctx,
						params,
						billingDetails,
						source,
						withAutumnId,
						failureStage: getCustomerCreationRecoveryStage({ ctx }),
					});
				}
			: undefined,
	});

	await ensureStripeCustomerFromCustomerData({
		ctx,
		customer: fullSubject.customer,
		customerData: params.customer_data,
		billingDetails,
	});

	return getApiCustomerV2({ ctx, fullSubject, withAutumnId });
};
