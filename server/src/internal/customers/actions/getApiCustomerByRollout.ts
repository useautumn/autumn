import { shed503OnTransientError } from "@/db/shed503OnTransientError.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { coalescedSubjectRead } from "@/internal/customers/cache/fullSubject/coalesceSubjectRead.js";
import {
	buildFullSubjectKey,
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
	l1TtlMs = 0,
}: {
	ctx: AutumnContext;
	customerId: string;
	entityId?: string;
	source?: string;
	withAutumnId?: boolean;
	l1TtlMs?: number;
}) => {
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

		if (l1TtlMs <= 0) return fetch();

		// The L1 stays on even under skipCache — it exists for Redis outages.
		return coalescedSubjectRead({
			key: buildFullSubjectKey({
				orgId: ctx.org.id,
				env: ctx.env,
				customerId,
				entityId,
			}),
			l1TtlMs,
			fetch,
		});
	};

	const fullSubject = await shed503OnTransientError({
		ctx,
		source: "get_customer",
		run: () => lookup({ skipCache: false }),
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
