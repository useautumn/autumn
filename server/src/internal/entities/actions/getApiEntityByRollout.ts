import type { ApiEntityV2 } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getOrSetCachedFullSubject } from "@/internal/customers/cache/fullSubject/index.js";
import { isFullSubjectRolloutEnabled } from "@/internal/misc/rollouts/fullSubjectRolloutUtils.js";
import { getApiEntity } from "../entityUtils/apiEntityUtils/getApiEntity.js";
import { getApiEntityV2 } from "../entityUtils/getApiEntityV2/getApiEntityV2.js";

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
};
