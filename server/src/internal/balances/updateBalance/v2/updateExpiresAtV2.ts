import {
	type CustomerEntitlementFilters,
	EntInterval,
	type FullSubject,
	fullSubjectToCustomerEntitlements,
	isPaidCustomerEntitlement,
	notNullish,
	orgToInStatuses,
	RecaseError,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService.js";

/**
 * Set `expires_at` on the targeted balance via the FullSubject cache path.
 *
 * Cache coherence is handled by refreshCacheMiddleware (both /balances/update
 * and /balances.update are registered in REFRESH_CACHE_ROUTE_CONFIGS), so this
 * only needs to persist to Postgres.
 */
export const updateExpiresAtV2 = async ({
	ctx,
	fullSubject,
	featureId,
	expiresAt,
	customerEntitlementFilters,
}: {
	ctx: AutumnContext;
	fullSubject: FullSubject;
	featureId: string | undefined;
	expiresAt: number;
	customerEntitlementFilters?: CustomerEntitlementFilters;
}) => {
	const cusEnts = fullSubjectToCustomerEntitlements({
		fullSubject,
		featureIds: featureId ? [featureId] : undefined,
		inStatuses: orgToInStatuses({ org: ctx.org }),
		customerEntitlementFilters,
	});

	if (cusEnts.length === 0) {
		throw new RecaseError({
			message: `No balances found for feature ${featureId}, customer ${fullSubject.customerId}`,
			statusCode: 404,
		});
	}

	const sorted = [...cusEnts].sort((a, b) => {
		const aExpires = a.expires_at ?? Number.POSITIVE_INFINITY;
		const bExpires = b.expires_at ?? Number.POSITIVE_INFINITY;
		return aExpires - bExpires;
	});

	const targetCusEnt = sorted[0];

	// Only paid recurring balances are off-limits: their lifetime follows the
	// billing cycle, so expiry belongs at the plan level (trial / ends_at).
	// Free grants (recurring OR one-off) and one-off prepaid top-ups are fine —
	// e.g. "100 credits/month for 6 months" is a free recurring grant that the
	// reset cron keeps refilling until it expires. A null interval is one-off.
	const interval = targetCusEnt.entitlement.interval;
	const isRecurring = notNullish(interval) && interval !== EntInterval.Lifetime;
	if (isRecurring && isPaidCustomerEntitlement(targetCusEnt)) {
		throw new RecaseError({
			message: `expires_at cannot be set on a paid recurring balance (feature ${targetCusEnt.entitlement.feature.id}); its lifetime follows the billing cycle`,
			statusCode: 400,
		});
	}

	await CusEntService.update({
		ctx,
		id: targetCusEnt.id,
		updates: { expires_at: expiresAt },
		incrementCacheVersion: false,
	});
};
