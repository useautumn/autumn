import {
	type FullCusEntWithFullCusProduct,
	sortCusEntsForDeduction,
} from "@autumn/shared";

// Row 42: the shared deduction order, sorted in place by the shared helper.
export const sortCustomerEntitlements = ({
	customerEntitlements,
}: {
	customerEntitlements: FullCusEntWithFullCusProduct[];
}): FullCusEntWithFullCusProduct[] => {
	sortCusEntsForDeduction({ cusEnts: customerEntitlements });
	return customerEntitlements;
};
