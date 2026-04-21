import { ErrCode, type ApiEntityV2 } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getOrSetCachedFullSubject } from "@/internal/customers/cache/fullSubject/index.js";
import { isFullSubjectRolloutEnabled } from "@/internal/misc/rollouts/fullSubjectRolloutUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import { withTimeout } from "@/utils/withTimeout.js";
import { getApiEntity } from "../entityUtils/apiEntityUtils/getApiEntity.js";
import { getApiEntityV2 } from "../entityUtils/getApiEntityV2/getApiEntityV2.js";

const GET_ENTITY_TIMEOUT_MS = 2_500;
const GET_ENTITY_TIMEOUT_MESSAGE = "Entity is temporarily unavailable";

export const getApiEntityByRollout = async ({
	ctx,
	customerId,
	entityId,
	source,
	withAutumnId = false,
}: {
	ctx: AutumnContext;
	customerId: string;
	entityId: string;
	source?: string;
	withAutumnId?: boolean;
}): Promise<ApiEntityV2> => {
	try {
		return await withTimeout({
			timeoutMs: GET_ENTITY_TIMEOUT_MS,
			timeoutMessage: GET_ENTITY_TIMEOUT_MESSAGE,
			fn: async () => {
				if (isFullSubjectRolloutEnabled({ ctx })) {
					const fullSubject = await getOrSetCachedFullSubject({
						ctx,
						customerId,
						entityId,
						source,
					});

					return getApiEntityV2({
						ctx,
						fullSubject,
						withAutumnId,
					});
				}

				return getApiEntity({
					ctx,
					customerId,
					entityId,
					withAutumnId,
				});
			},
		});
	} catch (error) {
		if (error instanceof Error && error.message === GET_ENTITY_TIMEOUT_MESSAGE) {
			throw new RecaseError({
				message: GET_ENTITY_TIMEOUT_MESSAGE,
				code: ErrCode.InternalError,
				statusCode: 503,
			});
		}
		throw error;
	}
};
