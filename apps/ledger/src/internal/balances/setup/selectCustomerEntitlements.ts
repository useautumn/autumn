import {
	type FullCusEntWithFullCusProduct,
	type FullCustomerEntitlement,
	isBooleanCusEnt,
	isPooledBalanceSourceCustomerEntitlement,
	isUnlimitedCusEnt,
	notNullish,
} from "@autumn/shared";

// Entity-scoped balances are unit 3; a customer-level command only folds rows
// that belong to no entity.
const isCustomerLevel = (
	customerEntitlement: FullCusEntWithFullCusProduct,
): boolean =>
	!customerEntitlement.internal_entity_id &&
	!customerEntitlement.entitlement.entity_feature_id &&
	!customerEntitlement.customer_product?.internal_entity_id;

// Row 32: a loose grant drained to zero is no longer live.
const isLiveLooseEntitlement = (
	customerEntitlement: FullCustomerEntitlement,
): boolean =>
	(notNullish(customerEntitlement.balance) &&
		customerEntitlement.balance !== 0) ||
	customerEntitlement.unlimited === true ||
	isUnlimitedCusEnt(customerEntitlement) ||
	isBooleanCusEnt({ cusEnt: customerEntitlement });

// Row 41: a product-backed row is only in scope while its product is one of the
// active statuses the store selects.
const hasLiveGrant = (
	customerEntitlement: FullCusEntWithFullCusProduct,
): boolean =>
	customerEntitlement.customer_product_id
		? customerEntitlement.customer_product !== null
		: isLiveLooseEntitlement(customerEntitlement);

const isFoldable = ({
	customerEntitlement,
	at,
}: {
	customerEntitlement: FullCusEntWithFullCusProduct;
	at: number;
}): boolean =>
	!isPooledBalanceSourceCustomerEntitlement({ customerEntitlement }) &&
	(!customerEntitlement.expires_at || customerEntitlement.expires_at > at) &&
	hasLiveGrant(customerEntitlement) &&
	isCustomerLevel(customerEntitlement);

export const selectCustomerEntitlements = ({
	customerEntitlements,
	at,
}: {
	customerEntitlements: FullCusEntWithFullCusProduct[];
	at: number;
}): FullCusEntWithFullCusProduct[] =>
	customerEntitlements.filter((customerEntitlement) =>
		isFoldable({ customerEntitlement, at }),
	);
