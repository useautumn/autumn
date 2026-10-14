import { ErrCode, type FullCustomer, RecaseError } from "@autumn/shared";
import { entitlementToExpiry } from "@/internal/billing/v2/utils/expiringGrants/entitlementExpiry";
import { EXTRA_CUSTOMER_ENTITLEMENT_LIMIT } from "@/internal/customers/repos/getFullSubject/getFullSubjectRowsQuery";

export const hasRoomForExpiringGrant = ({
	fullCustomer,
	now,
	incoming = 1,
}: {
	fullCustomer: FullCustomer;
	now: number;
	incoming?: number;
}): boolean => {
	if (incoming <= 0) return true;
	const liveLooseRows = fullCustomer.extra_customer_entitlements.filter(
		(row) => row.expires_at == null || row.expires_at > now,
	);
	return liveLooseRows.length + incoming <= EXTRA_CUSTOMER_ENTITLEMENT_LIMIT;
};

export const assertRoomForExpiringGrants = ({
	fullCustomer,
	incoming,
	now,
}: {
	fullCustomer: FullCustomer;
	incoming: number;
	now: number;
}) => {
	if (hasRoomForExpiringGrant({ fullCustomer, now, incoming })) return;
	throw new RecaseError({
		message:
			"This customer already holds the maximum number of separate balances; an expiring purchase would not be visible to them. Wait for existing balances to expire, or use a non-expiring item.",
		code: ErrCode.InvalidRequest,
		statusCode: 400,
	});
};

export const isExpiringPurchase = ({
	customerEntitlement,
}: {
	customerEntitlement: {
		entitlement: Parameters<typeof entitlementToExpiry>[0]["entitlement"];
	};
}): boolean =>
	entitlementToExpiry({ entitlement: customerEntitlement.entitlement }) != null;
