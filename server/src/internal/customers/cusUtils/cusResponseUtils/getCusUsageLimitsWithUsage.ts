import {
	type ApiUsageLimit,
	type FullCustomer,
	fullSubjectToApiUsageLimits,
	orgToInStatuses,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getOrSetCachedFullSubject } from "@/internal/customers/cache/fullSubject/index.js";

export type UsageLimitsWithUsage = {
	customer?: ApiUsageLimit[];
	byInternalEntityId: Record<string, ApiUsageLimit[]>;
};

const SOURCE = "dashboard_usage_limits";

/**
 * Decorate usage limits with `usage` (consumed in the active window) the same
 * way getApiCustomerBaseV2 does. The live counter lives in the Redis balance
 * hash, so we read each scope via getOrSetCachedFullSubject (which rehydrates
 * it) — a DB-only read returns a stale/zero counter.
 *
 * Done for the customer AND every entity with caps, because the dashboard
 * payload carries both and the client may fetch either scope, so usage must
 * not hinge on the request's entity_id. Returns undefined when no caps exist.
 */
export const getCusUsageLimitsWithUsage = async ({
	ctx,
	fullCus,
}: {
	ctx: AutumnContext;
	fullCus: FullCustomer;
}): Promise<UsageLimitsWithUsage | undefined> => {
	const entitiesWithCaps = (fullCus.entities ?? []).filter(
		(entity) => (entity.usage_limits?.length ?? 0) > 0,
	);
	const customerHasCaps = (fullCus.usage_limits?.length ?? 0) > 0;
	if (!customerHasCaps && entitiesWithCaps.length === 0) {
		return undefined;
	}

	const features = ctx.features;
	const inStatuses = orgToInStatuses({ org: ctx.org });
	const customerId = fullCus.internal_id;

	const [customer, entityEntries] = await Promise.all([
		customerHasCaps
			? getOrSetCachedFullSubject({ ctx, customerId, source: SOURCE }).then(
					(fullSubject) =>
						fullSubjectToApiUsageLimits({
							fullSubject,
							features,
							inStatuses,
							source: "customer",
						}),
				)
			: Promise.resolve(undefined),
		Promise.all(
			entitiesWithCaps.map(async (entity) => {
				const fullSubject = await getOrSetCachedFullSubject({
					ctx,
					customerId,
					entityId: entity.id ?? entity.internal_id,
					source: SOURCE,
				});
				const decorated = fullSubjectToApiUsageLimits({
					fullSubject,
					features,
					inStatuses,
					source: "entity",
				});
				return [entity.internal_id, decorated] as const;
			}),
		),
	]);

	const byInternalEntityId: Record<string, ApiUsageLimit[]> = {};
	for (const [internalEntityId, decorated] of entityEntries) {
		if (decorated) byInternalEntityId[internalEntityId] = decorated;
	}

	return { customer, byInternalEntityId };
};
