import {
	CusProductStatus,
	type FullCusProduct,
	type FullCustomer,
	type ProductV2,
} from "@autumn/shared";
import { customerProductToCustomerStatePlan } from "./customerProductToCustomerStatePlan";
import type { CustomerStatePlan } from "./customerStateSchema";

export function getActiveCustomerProducts({
	customer,
}: {
	customer: FullCustomer | undefined;
}): FullCusProduct[] {
	return (
		customer?.customer_products.filter(
			(cp) => cp.status === CusProductStatus.Active && !cp.canceled_at,
		) ?? []
	);
}

export function getActiveCustomerPlans({
	customer,
	products,
}: {
	customer: FullCustomer | undefined;
	products: ProductV2[];
}): CustomerStatePlan[] {
	return getActiveCustomerProducts({ customer }).map((cp) =>
		customerProductToCustomerStatePlan({ cusProduct: cp, products }),
	);
}
