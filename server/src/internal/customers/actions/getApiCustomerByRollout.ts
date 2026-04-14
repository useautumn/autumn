import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getOrSetCachedFullSubject } from "@/internal/customers/cache/fullSubject/index.js";
import { isFullSubjectRolloutEnabled } from "@/internal/misc/rollouts/fullSubjectRolloutUtils.js";
import { getApiCustomer } from "../cusUtils/apiCusUtils/getApiCustomer.js";
import { getOrSetCachedFullCustomer } from "../cusUtils/fullCustomerCacheUtils/getOrSetCachedFullCustomer.js";
import { getApiCustomerV2 } from "../cusUtils/getApiCustomerV2/index.js";

export const getApiCustomerByRollout = async ({
	ctx,
	customerId,
	entityId,
	source,
	withAutumnId,
}: {
	ctx: AutumnContext;
	customerId: string;
	entityId?: string;
	source?: string;
	withAutumnId?: boolean;
}) => {
	if (isFullSubjectRolloutEnabled({ ctx })) {
		const fullSubject = await getOrSetCachedFullSubject({
			ctx,
			customerId,
			entityId,
			source,
		});

		return getApiCustomerV2({
			ctx,
			fullSubject,
			withAutumnId,
		});
	}

	const fullCustomer = await getOrSetCachedFullCustomer({
		ctx,
		customerId,
		entityId,
		source,
	});

	return getApiCustomer({
		ctx,
		fullCustomer,
		withAutumnId,
	});
};
