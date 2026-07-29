import type { CheckParams, TrackParams } from "@autumn/shared";
import { shed503OnTransientError } from "@/db/shed503OnTransientError.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getOrCreateCachedFullSubject } from "@/internal/customers/cache/fullSubject/index.js";
import {
	getCustomerCreationRecoveryStage,
	setCustomerCreationRecoveryStage,
} from "@/internal/customers/recovery/customerCreationRecoveryStage.js";
import { queueFailedCustomerCreation } from "@/internal/customers/recovery/queueFailedCustomerCreation.js";
import { isFullSubjectRolloutEnabled } from "@/internal/misc/rollouts/fullSubjectRolloutUtils.js";
import { getApiCustomerV2 } from "../cusUtils/getApiCustomerV2/index.js";
import { ensureStripeCustomerFromCustomerData } from "./ensureStripeCustomerFromCustomerData.js";

export const getOrCreateApiCustomerByRollout = async ({
	ctx,
	params,
	source,
	withAutumnId,
	enqueueRecoveryOnTransientFailure = true,
}: {
	ctx: AutumnContext;
	params: Omit<TrackParams | CheckParams, "customer_id"> & {
		customer_id: string | null;
	};
	source?: string;
	withAutumnId?: boolean;
	enqueueRecoveryOnTransientFailure?: boolean;
}) => {
	setCustomerCreationRecoveryStage({ ctx, stage: "lookup" });

	if (isFullSubjectRolloutEnabled({ ctx })) {
	}

	const fullSubject = await shed503OnTransientError({
		ctx,
		source: "get_or_create",
		run: () => getOrCreateCachedFullSubject({ ctx, params, source }),
		onTransientError: enqueueRecoveryOnTransientFailure
			? async () => {
					await queueFailedCustomerCreation({
						ctx,
						params,
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
	});

	return getApiCustomerV2({ ctx, fullSubject, withAutumnId });
};
