import {
	CusProductStatus,
	type FullCustomer,
	type ProductV2,
} from "@autumn/shared";
import { customerProductToCustomerStatePlan } from "./customerProductToCustomerStatePlan";
import type { CustomerStatePlan } from "./customerStateSchema";

/** Every active plan, whatever its scope — each row carries its own. */
export function getActiveCustomerPlans({
	customer,
	products,
}: {
	customer: FullCustomer | undefined;
	products: ProductV2[];
}): CustomerStatePlan[] {
	return (
		customer?.customer_products
			.filter((cp) => cp.status === CusProductStatus.Active && !cp.canceled_at)
			.map((cp) =>
				customerProductToCustomerStatePlan({ cusProduct: cp, products }),
			) ?? []
	);
}
