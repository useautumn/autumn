import type { ApiEntityV2 } from "@autumn/shared";
import { shed503OnTransientError } from "@/db/shed503OnTransientError.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { coalescedSubjectRead } from "@/internal/customers/cache/fullSubject/coalesceSubjectRead.js";
import {
	buildFullSubjectKey,
	getOrSetCachedFullSubject,
} from "@/internal/customers/cache/fullSubject/index.js";
import { isRedisFallbackToDbEnabled } from "@/internal/misc/miscellaneousEdgeConfig/miscellaneousEdgeConfigStore.js";
import { isFullSubjectRolloutEnabled } from "@/internal/misc/rollouts/fullSubjectRolloutUtils.js";
import { getApiEntityV2 } from "../entityUtils/getApiEntityV2/getApiEntityV2.js";

export const getApiEntityByRollout = async ({
	ctx,
	customerId,
	entityId,
	source,
	withAutumnId = false,
	singleflight = false,
}: {
	ctx: AutumnContext;
	customerId: string;
	entityId: string;
	source?: string;
	withAutumnId?: boolean;
	singleflight?: boolean;
}): Promise<ApiEntityV2> => {
	if (isFullSubjectRolloutEnabled({ ctx })) {
	}

	const lookup = ({ skipCache }: { skipCache: boolean }) => {
		const fetch = () =>
			getOrSetCachedFullSubject({
				ctx: skipCache ? { ...ctx, skipCache: true } : ctx,
				customerId,
				entityId,
				source,
			});

		if (!singleflight) return fetch();

		return coalescedSubjectRead({
			key: buildFullSubjectKey({
				orgId: ctx.org.id,
				env: ctx.env,
				customerId,
				entityId,
			}),
			singleflight,
			fetch,
		});
	};

	const fullSubject = await shed503OnTransientError({
		ctx,
		source: "entities.get",
		run: () => lookup({ skipCache: false }),
		fallbackOnRedisUnavailable: isRedisFallbackToDbEnabled()
			? () => lookup({ skipCache: true })
			: undefined,
	});

	return getApiEntityV2({
		ctx,
		fullSubject,
		withAutumnId,
	});
};
