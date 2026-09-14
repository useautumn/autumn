import type { FullCustomer } from "@autumn/shared";
import { entitlementToExpiry } from "@/internal/billing/v2/utils/expiringGrants/entitlementExpiry";
import { EXTRA_CUSTOMER_ENTITLEMENT_LIMIT } from "@/internal/customers/repos/getFullSubject/getFullSubjectRowsQuery";

/**
 * Loose rows hydrate under a hard cap, newest first. Past it, the oldest —
 * soonest-expiring — grants silently drop out of the subject. Refuse the
 * purchase instead of charging for credits the customer could never see.
 * Reads the rows already in memory; never counts the database.
 */
export const hasRoomForExpiringGrant = ({
	fullCustomer,
	now,
}: {
	fullCustomer: FullCustomer;
	now: number;
}): boolean => {
	const liveLooseRows = fullCustomer.extra_customer_entitlements.filter(
		(row) => row.expires_at == null || row.expires_at > now,
	);
	return liveLooseRows.length < EXTRA_CUSTOMER_ENTITLEMENT_LIMIT;
};

export const isExpiringPurchase = ({
	customerEntitlement,
}: {
	customerEntitlement: {
		entitlement: Parameters<typeof entitlementToExpiry>[0]["entitlement"];
	};
}): boolean =>
	entitlementToExpiry({ entitlement: customerEntitlement.entitlement }) != null;
