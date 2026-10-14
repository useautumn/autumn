import type {
	CarryOverUsages,
	FullCusEntWithFullCusProduct,
	FullCusProduct,
} from "@autumn/shared";
import { carriesOverUsage } from "./carriesOverUsage";

export const carriesUsageFrom = ({
	carryOverUsages,
	sourceCustomerProducts,
}: {
	carryOverUsages: CarryOverUsages;
	sourceCustomerProducts: Pick<FullCusProduct, "id">[];
}) => {
	const sourceCustomerProductIds = new Set(
		sourceCustomerProducts.map(({ id }) => id),
	);
	return (customerEntitlement: FullCusEntWithFullCusProduct) =>
		carriesOverUsage({
			carryOverUsages,
			sourceCustomerProductIds,
			customerEntitlement,
		});
};
