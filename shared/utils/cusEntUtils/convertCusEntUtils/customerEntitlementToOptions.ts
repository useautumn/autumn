import type { FullCusEntWithFullCusProduct } from "@models/cusProductModels/cusEntModels/cusEntWithProduct";
import { entToOptions } from "@utils/productUtils/convertProductUtils";

export const customerEntitlementToOptions = ({
	customerEntitlement,
}: {
	customerEntitlement: FullCusEntWithFullCusProduct;
}) => {
	return entToOptions({
		ent: customerEntitlement.entitlement,
		options: customerEntitlement.customer_product?.options ?? [],
	});
};
