import { ErrCode } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getOrSetCachedFullSubject } from "@/internal/customers/cache/fullSubject/index.js";
import { isFullSubjectRolloutEnabled } from "@/internal/misc/rollouts/fullSubjectRolloutUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import { withTimeout } from "@/utils/withTimeout.js";
import { getApiCustomer } from "../cusUtils/apiCusUtils/getApiCustomer.js";
import { getOrSetCachedFullCustomer } from "../cusUtils/fullCustomerCacheUtils/getOrSetCachedFullCustomer.js";
import { getApiCustomerV2 } from "../cusUtils/getApiCustomerV2/index.js";

const GET_CUSTOMER_TIMEOUT_MS = 2_500;
const GET_CUSTOMER_TIMEOUT_MESSAGE = "Customer is temporarily unavailable";

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
}): Promise<Record<string, unknown>> => {
	try {
		return (await withTimeout({
			timeoutMs: GET_CUSTOMER_TIMEOUT_MS,
			timeoutMessage: GET_CUSTOMER_TIMEOUT_MESSAGE,
			fn: async () => {
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
			},
		})) as Record<string, unknown>;
	} catch (error) {
		if (error instanceof Error && error.message === GET_CUSTOMER_TIMEOUT_MESSAGE) {
			throw new RecaseError({
				message: GET_CUSTOMER_TIMEOUT_MESSAGE,
				code: ErrCode.InternalError,
				statusCode: 503,
			});
		}
		throw error;
	}
};
