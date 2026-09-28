import { shed503OnTransientError } from "@/db/shed503OnTransientError.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { coalescedSubjectRead } from "@/internal/customers/cache/fullSubject/coalesceSubjectRead.js";
import {
	buildSubjectReadFlightKey,
	getOrSetCachedFullSubject,
} from "@/internal/customers/cache/fullSubject/index.js";
import { isRedisFallbackToDbEnabled } from "@/internal/misc/miscellaneousEdgeConfig/miscellaneousEdgeConfigStore.js";
import { isFullSubjectRolloutEnabled } from "@/internal/misc/rollouts/fullSubjectRolloutUtils.js";
import { getApiCustomerV2 } from "../cusUtils/getApiCustomerV2/index.js";

export const getApiCustomerByRollout = async ({
	ctx,
	customerId,
	entityId,
	source,
	withAutumnId,
	singleflight = false,
	disableReplicaRead = false,
}: {
	ctx: AutumnContext;
	customerId: string;
	entityId?: string;
	source?: string;
	withAutumnId?: boolean;
	singleflight?: boolean;
	disableReplicaRead?: boolean;
}) => {
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
		source: "get_customer",
		run: () => lookup({ skipCache: false }),
		// Bounded by the 15s pool clocks and query_timeout, not an extra budget.
		fallbackOnRedisUnavailable: isRedisFallbackToDbEnabled()
			? () => lookup({ skipCache: true })
			: undefined,
	});

	return getApiCustomerV2({
		ctx,
		fullSubject,
		withAutumnId,
	});
};
