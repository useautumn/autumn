import {
	type ApiUsageLimit,
	decorateInheritedPlanUsageLimits,
	type FullCustomer,
	fullSubjectToApiUsageLimits,
	getPlanBillingControlProducts,
	orgToInStatuses,
	usageLimitIdentity,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getOrSetCachedFullSubject } from "@/internal/customers/cache/fullSubject/index.js";

export type UsageLimitsWithUsage = {
	customer?: ApiUsageLimit[];
	plan?: ApiUsageLimit[];
	byInternalEntityId: Record<string, ApiUsageLimit[]>;
};

const SOURCE = "dashboard_usage_limits";

/** Most recent plan wins per (feature, filter), matching the dashboard's row selection. */
const uniqueByIdentity = <T extends Parameters<typeof usageLimitIdentity>[0]>(
	usageLimits: T[],
): T[] => {
	const seen = new Set<string>();
	return usageLimits.filter((usageLimit) => {
		const identity = usageLimitIdentity(usageLimit);
		if (seen.has(identity)) return false;
		seen.add(identity);
		return true;
	});
};

/**
 * Decorate usage limits with `usage` (consumed in the active window) the same
 * way getApiCustomerBaseV2 does. The live counter lives in the Redis balance
 * hash, so we read each scope via getOrSetCachedFullSubject (which rehydrates
 * it) — a DB-only read returns a stale/zero counter.
 *
 * Done for the customer, its plan-inherited caps, AND every entity with caps,
 * because the dashboard payload carries all scopes and the client may render
 * any of them. Returns undefined when no caps exist anywhere.
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
	const planUsageLimits = uniqueByIdentity(
		getPlanBillingControlProducts({
			customerProducts: fullCus.customer_products ?? [],
		}).flatMap((planProduct) => planProduct.product.usage_limits ?? []),
	);
	const planHasCaps = planUsageLimits.length > 0;
	if (!customerHasCaps && !planHasCaps && entitiesWithCaps.length === 0) {
		return undefined;
	}

	const features = ctx.features;
	const inStatuses = orgToInStatuses({ org: ctx.org });
	const customerId = fullCus.internal_id;

	const [customerFullSubject, entityEntries] = await Promise.all([
		customerHasCaps || planHasCaps
			? getOrSetCachedFullSubject({ ctx, customerId, source: SOURCE })
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

	const customer =
		customerHasCaps && customerFullSubject
			? fullSubjectToApiUsageLimits({
					fullSubject: customerFullSubject,
					features,
					inStatuses,
					source: "customer",
				})
			: undefined;

	const plan =
		planHasCaps && customerFullSubject
			? decorateInheritedPlanUsageLimits({
					usageLimits: planUsageLimits,
					fullSubject: customerFullSubject,
					features,
				}).map((usageLimit) => ({ ...usageLimit, source: "plan" as const }))
			: undefined;

	const byInternalEntityId: Record<string, ApiUsageLimit[]> = {};
	for (const [internalEntityId, decorated] of entityEntries) {
		if (decorated) byInternalEntityId[internalEntityId] = decorated;
	}

	return { customer, plan, byInternalEntityId };
};
