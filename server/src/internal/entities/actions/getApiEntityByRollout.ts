import type { ApiEntityV2 } from "@autumn/shared";
import { shed503OnTransientError } from "@/db/shed503OnTransientError.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	FALLBACK_DB_HYDRATION_BUDGET_MS,
	FALLBACK_DB_HYDRATION_TIMEOUT_MESSAGE,
} from "@/internal/customers/actions/getApiCustomerByRollout.js";
import { coalescedSubjectRead } from "@/internal/customers/cache/fullSubject/coalesceSubjectRead.js";
import {
	buildSubjectReadFlightKey,
	getOrSetCachedFullSubject,
} from "@/internal/customers/cache/fullSubject/index.js";
import { isRedisFallbackToDbEnabled } from "@/internal/misc/edgeConfigs/miscellaneousEdgeConfig/miscellaneousEdgeConfigStore.js";
import { isFullSubjectRolloutEnabled } from "@/internal/misc/edgeConfigs/rollouts/fullSubjectRolloutUtils.js";
import { withTimeout } from "@/utils/withTimeout.js";
import { getApiEntityV2 } from "../entityUtils/getApiEntityV2/getApiEntityV2.js";

export const getApiEntityByRollout = async ({
	ctx,
	customerId,
	entityId,
	source,
	withAutumnId = false,
	singleflight = false,
	disableReplicaRead = false,
}: {
	ctx: AutumnContext;
	customerId: string;
	entityId: string;
	source?: string;
	withAutumnId?: boolean;
	singleflight?: boolean;
	disableReplicaRead?: boolean;
}): Promise<ApiEntityV2> => {
	if (isFullSubjectRolloutEnabled({ ctx })) {
	}

	const lookup = async ({ skipCache }: { skipCache: boolean }) => {
		const effectiveSkipCache = skipCache || ctx.skipCache;
		const readFrom = disableReplicaRead ? "primary" : "replica-ok";

		const fetch = () =>
			getOrSetCachedFullSubject({
				// Sole replica grant; writers opt out via disableReplicaRead.
				readFrom,
				ctx: effectiveSkipCache ? { ...ctx, skipCache: true } : ctx,
				customerId,
				entityId,
				source,
			});

		if (!singleflight) return fetch();

		let servedByFetch = false;
		const fullSubject = await coalescedSubjectRead({
			key: buildSubjectReadFlightKey({
				orgId: ctx.org.id,
				env: ctx.env,
				customerId,
				entityId,
				skipCache: effectiveSkipCache,
				readFrom,
			}),
			singleflight,
			fetch: () => {
				servedByFetch = true;
				return fetch();
			},
		});
		// Joined singleflights never enter fetch — the shared flight serves them.
		if (!servedByFetch && ctx.subjectReadTrace) {
			ctx.subjectReadTrace.source = "cache";
		}
		return fullSubject;
	};

	const fullSubject = await shed503OnTransientError({
		ctx,
		source: "entities.get",
		run: () => lookup({ skipCache: false }),
		fallbackOnRedisUnavailable: isRedisFallbackToDbEnabled()
			? () =>
					withTimeout({
						timeoutMs: FALLBACK_DB_HYDRATION_BUDGET_MS,
						timeoutMessage: FALLBACK_DB_HYDRATION_TIMEOUT_MESSAGE,
						fn: () => lookup({ skipCache: true }),
					})
			: undefined,
	});

	return getApiEntityV2({
		ctx,
		fullSubject,
		withAutumnId,
	});
};
