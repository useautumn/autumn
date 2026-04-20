import type { CheckParams, TrackParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getOrCreateCachedFullSubject } from "@/internal/customers/cache/fullSubject/index.js";
import { isFullSubjectRolloutEnabled } from "@/internal/misc/rollouts/fullSubjectRolloutUtils.js";
import { getApiCustomer } from "../cusUtils/apiCusUtils/getApiCustomer.js";
import { getOrCreateCachedFullCustomer } from "../cusUtils/fullCustomerCacheUtils/getOrCreateCachedFullCustomer.js";
import { getApiCustomerV2 } from "../cusUtils/getApiCustomerV2/index.js";

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
	if (isFullSubjectRolloutEnabled({ ctx })) {
		const fullSubject = await getOrCreateCachedFullSubject({
			ctx,
			params,
			source,
		});

		return getApiCustomerV2({
			ctx,
			fullSubject,
			withAutumnId,
		});
	}

	const fullCustomer = await getOrCreateCachedFullCustomer({
		ctx,
		params,
		source,
	});

	return getApiCustomer({
		ctx,
		fullCustomer,
		withAutumnId,
	});
};
