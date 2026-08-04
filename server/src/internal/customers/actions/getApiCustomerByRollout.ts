import { shed503OnTransientError } from "@/db/shed503OnTransientError.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { coalescedSubjectRead } from "@/internal/customers/cache/fullSubject/coalesceSubjectRead.js";
import {
	buildFullSubjectKey,
	getOrSetCachedFullSubject,
} from "@/internal/customers/cache/fullSubject/index.js";
import { isRedisFallbackToDbEnabled } from "@/internal/misc/miscellaneousEdgeConfig/miscellaneousEdgeConfigStore.js";
import { isFullSubjectRolloutEnabled } from "@/internal/misc/rollouts/fullSubjectRolloutUtils.js";
import { withTimeout } from "@/utils/withTimeout.js";
import { getApiCustomerV2 } from "../cusUtils/getApiCustomerV2/index.js";

/** Same deadline as check's DB hydration — a Redis-down fallback can't wait out the 15s pool clocks.
 *  "Query read timeout" keeps the expiry classified transient so shed503 sheds instead of rethrowing. */
export const FALLBACK_DB_HYDRATION_BUDGET_MS = 2_000;
export const FALLBACK_DB_HYDRATION_TIMEOUT_MESSAGE = "Query read timeout";

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
		const fetch = () =>
			getOrSetCachedFullSubject({
				// Sole replica grant; writers opt out via disableReplicaRead.
				readFrom: disableReplicaRead ? "primary" : "replica-ok",
				ctx: skipCache ? { ...ctx, skipCache: true } : ctx,
				customerId,
				entityId,
				source,
			});

		if (!singleflight) return fetch();

		let servedByFetch = false;
		const fullSubject = await coalescedSubjectRead({
			key: buildFullSubjectKey({
				orgId: ctx.org.id,
				env: ctx.env,
				customerId,
				entityId,
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
		fallbackOnRedisUnavailable: isRedisFallbackToDbEnabled()
			? () =>
					withTimeout({
						timeoutMs: FALLBACK_DB_HYDRATION_BUDGET_MS,
						timeoutMessage: FALLBACK_DB_HYDRATION_TIMEOUT_MESSAGE,
						fn: () => lookup({ skipCache: true }),
					})
			: undefined,
	});

	return getApiCustomerV2({
		ctx,
		fullSubject,
		withAutumnId,
	});
};
