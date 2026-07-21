import { cp, type FullCusProduct, type PooledBalanceOp } from "@autumn/shared";
import { customerProductHasPooledSource } from "@/internal/billing/v2/pooledBalances/utils/pooledCustomerEntitlementClassification.js";

type StageOwnerRemovalOperation = Extract<
	PooledBalanceOp,
	{ op: "stage_owner_removal" }
>;
type RestoreOwnerOperation = Extract<PooledBalanceOp, { op: "restore_owner" }>;

export const customerProductToPooledBalanceRemovalOp = ({
	customerProduct,
	effectiveAt,
}: {
	customerProduct: FullCusProduct;
	effectiveAt: number | null;
}): PooledBalanceOp | undefined => {
	if (cp(customerProduct).scheduled().valid) return undefined;

	if (!customerProductHasPooledSource(customerProduct)) return undefined;

	return {
		op: "remove_source",
		internalCustomerId: customerProduct.internal_customer_id,
		sourceCustomerProductId: customerProduct.id,
		effectiveAt,
	};
};

export const customerProductToPooledBalanceRestoreOp = ({
	customerProduct,
	expectedEffectiveAt,
}: {
	customerProduct: FullCusProduct;
	expectedEffectiveAt: number;
}): PooledBalanceOp | undefined => {
	if (cp(customerProduct).scheduled().valid) return undefined;

	if (!customerProductHasPooledSource(customerProduct)) return undefined;

	return {
		op: "restore_source",
		internalCustomerId: customerProduct.internal_customer_id,
		sourceCustomerProductId: customerProduct.id,
		expectedEffectiveAt,
	};
};

// A parent's license links: seat contributions are owned by the LINK, so
// parent lifecycle events fan out to one op per link.
const customerProductToLicenseLinkIds = (customerProduct: FullCusProduct) => [
	...new Set(
		(customerProduct.customer_licenses ?? []).map(
			(customerLicense) => customerLicense.link_id,
		),
	),
];

export const customerProductToPooledBalanceOwnerRemovalOps = ({
	customerProduct,
	effectiveAt,
}: {
	customerProduct: FullCusProduct;
	effectiveAt: number;
}): StageOwnerRemovalOperation[] =>
	customerProductToLicenseLinkIds(customerProduct).map(
		(customerLicenseLinkId) => ({
			op: "stage_owner_removal",
			internalCustomerId: customerProduct.internal_customer_id,
			customerLicenseLinkId,
			effectiveAt,
		}),
	);

export const customerProductToPooledBalanceOwnerRestoreOps = ({
	customerProduct,
	expectedEffectiveAt,
}: {
	customerProduct: FullCusProduct;
	expectedEffectiveAt: number;
}): RestoreOwnerOperation[] =>
	customerProductToLicenseLinkIds(customerProduct).map(
		(customerLicenseLinkId) => ({
			op: "restore_owner",
			internalCustomerId: customerProduct.internal_customer_id,
			customerLicenseLinkId,
			expectedEffectiveAt,
		}),
	);
