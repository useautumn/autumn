import {
	type CustomerEntitlementFilters,
	EntInterval,
	type FullCustomer,
	fullCustomerToCustomerEntitlements,
	notNullish,
	orgToInStatuses,
	RecaseError,
} from "@autumn/shared";
import type { AutumnContext } from "../../../honoUtils/HonoEnv.js";
import { CusEntService } from "../../customers/cusProducts/cusEnts/CusEntitlementService.js";

/**
 * Set `expires_at` on the targeted balance (customer_entitlement).
 *
 * Cache coherence is handled by refreshCacheMiddleware (both /balances/update
 * and /balances.update are registered in REFRESH_CACHE_ROUTE_CONFIGS), so this
 * only needs to persist to Postgres.
 */
export const updateExpiresAt = async ({
	ctx,
	fullCustomer,
	featureId,
	expiresAt,
	customerEntitlementFilters,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	featureId: string | undefined;
	expiresAt: number;
	customerEntitlementFilters?: CustomerEntitlementFilters;
}) => {
	const cusEnts = fullCustomerToCustomerEntitlements({
		fullCustomer,
		featureIds: featureId ? [featureId] : undefined,
		entity: fullCustomer.entity,
		inStatuses: orgToInStatuses({ org: ctx.org }),
		customerEntitlementFilters,
	});

	if (cusEnts.length === 0) {
		throw new RecaseError({
			message: `No balances found for feature ${featureId}, customer ${fullCustomer.id}`,
			statusCode: 404,
		});
	}

	// When multiple balances match, target the one that expires earliest
	// (nulls last) for a deterministic choice; callers narrow to a single
	// balance via balance_id / interval.
	const sorted = [...cusEnts].sort((a, b) => {
		const aExpires = a.expires_at ?? Number.POSITIVE_INFINITY;
		const bExpires = b.expires_at ?? Number.POSITIVE_INFINITY;
		return aExpires - bExpires;
	});

	const targetCusEnt = sorted[0];

	// expires_at only makes sense on one-off balances (loose grants and one-off
	// prepaid top-ups). Recurring balances reset each cycle — expiry belongs at
	// the plan level (trial / ends_at) — and usage-based/arrear balances are
	// recurring, so this guard covers them too. A null interval is treated as
	// one-off (loose).
	const interval = targetCusEnt.entitlement.interval;
	if (notNullish(interval) && interval !== EntInterval.Lifetime) {
		throw new RecaseError({
			message: `expires_at can only be set on one-off balances, not recurring balances (feature ${targetCusEnt.entitlement.feature.id})`,
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
