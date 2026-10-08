import {
	CusProductStatus,
	type FullCusProduct,
	type FullCustomer,
	type ProductV2,
} from "@autumn/shared";
import { customerProductToCustomerStatePlan } from "./customerProductToCustomerStatePlan";
import type { CustomerStatePlan } from "./customerStateSchema";

/** Active plans that aren't set to cancel, whatever their scope. */
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

/** Every active plan, whatever its scope — each row carries its own. */
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
