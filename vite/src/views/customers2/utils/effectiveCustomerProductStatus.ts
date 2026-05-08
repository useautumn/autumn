import {
	CusProductStatus,
	type FullCusProduct,
	hasCustomerProductEnded,
} from "@autumn/shared";

export function withEffectiveCustomerProductStatus({
	customerProduct,
	nowMs,
}: {
	customerProduct: FullCusProduct;
	nowMs?: number;
}): FullCusProduct {
	if (!hasCustomerProductEnded(customerProduct, { nowMs })) {
		return customerProduct;
	}

	return { ...customerProduct, status: CusProductStatus.Expired };
}
