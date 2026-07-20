import type { CheckParams, TrackParams } from "@autumn/shared";
import { shed503OnTransientError } from "@/db/shed503OnTransientError.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getOrCreateCachedFullSubject } from "@/internal/customers/cache/fullSubject/index.js";
import { isFullSubjectRolloutEnabled } from "@/internal/misc/rollouts/fullSubjectRolloutUtils.js";
import { getApiCustomer } from "../cusUtils/apiCusUtils/getApiCustomer.js";
import { getOrCreateCachedFullCustomer } from "../cusUtils/fullCustomerCacheUtils/getOrCreateCachedFullCustomer.js";
import { getApiCustomerV2 } from "../cusUtils/getApiCustomerV2/index.js";
import { ensureStripeCustomerFromCustomerData } from "./ensureStripeCustomerFromCustomerData.js";

export const getOrCreateApiCustomerByRollout = async ({
	ctx,
	params,
	source,
	withAutumnId,
}: {
	ctx: AutumnContext;
	params: Omit<TrackParams | CheckParams, "customer_id"> & {
		customer_id: string | null;
	};
	source?: string;
	withAutumnId?: boolean;
}) => {
	let fullSubject:
		| Awaited<ReturnType<typeof getOrCreateCachedFullSubject>>
		| undefined;
	let fullCustomer:
		| Awaited<ReturnType<typeof getOrCreateCachedFullCustomer>>
		| undefined;

	if (isFullSubjectRolloutEnabled({ ctx })) {
		fullSubject = await shed503OnTransientError({
			ctx,
			source: "get_or_create",
			run: () => getOrCreateCachedFullSubject({ ctx, params, source }),
		});
	} else {
		fullCustomer = await getOrCreateCachedFullCustomer({
			ctx,
			params,
			source,
		});
	}

	await ensureStripeCustomerFromCustomerData({
		ctx,
		customer: fullSubject?.customer ?? fullCustomer!,
		customerData: params.customer_data,
	});

	if (fullSubject) return getApiCustomerV2({ ctx, fullSubject, withAutumnId });

	return getApiCustomer({ ctx, fullCustomer: fullCustomer!, withAutumnId });
};
