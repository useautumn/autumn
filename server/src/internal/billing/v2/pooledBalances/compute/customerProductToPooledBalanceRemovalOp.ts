import {
	cp,
	type FullCusProduct,
	type PooledBalanceOp,
	PooledBalanceResetOwnerType,
} from "@autumn/shared";
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

	if (!customerProductHasPooledSource({ customerProduct })) return undefined;

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

	if (!customerProductHasPooledSource({ customerProduct })) return undefined;

	return {
		op: "restore_source",
		internalCustomerId: customerProduct.internal_customer_id,
		sourceCustomerProductId: customerProduct.id,
		expectedEffectiveAt,
	};
};

export const customerProductToPooledBalanceOwnerRemovalOp = ({
	customerProduct,
	effectiveAt,
}: {
	customerProduct: FullCusProduct;
	effectiveAt: number;
}): StageOwnerRemovalOperation => ({
	op: "stage_owner_removal",
	internalCustomerId: customerProduct.internal_customer_id,
	resetOwnerType: PooledBalanceResetOwnerType.CustomerProduct,
	resetOwnerId: customerProduct.id,
	effectiveAt,
});

export const customerProductToPooledBalanceOwnerRestoreOp = ({
	customerProduct,
	expectedEffectiveAt,
}: {
	customerProduct: FullCusProduct;
	expectedEffectiveAt: number;
}): RestoreOwnerOperation => ({
	op: "restore_owner",
	internalCustomerId: customerProduct.internal_customer_id,
	resetOwnerType: PooledBalanceResetOwnerType.CustomerProduct,
	resetOwnerId: customerProduct.id,
	expectedEffectiveAt,
});
