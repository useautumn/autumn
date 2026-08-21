import type {
	EntitlementPrice,
	FullProductWithoutLicenses,
	PlanItemFilter,
} from "@autumn/shared";
import { pairRemovedAndAddedPlanItems } from "@autumn/shared/utils/planV1Utils/customize/pairRemovedAndAddedPlanItems.js";
import type { CustomerProductTransition } from "@/internal/billing/v2/actions/batchTransition/compute/transitions/computeCustomerProductTransition.js";
import { computeCustomerProductTransition } from "@/internal/billing/v2/actions/batchTransition/compute/transitions/computeCustomerProductTransition.js";
import type { PatchProductTransition } from "../../types/index.js";
import { planItemFilterToEntitlementPriceFilter } from "./planItemFilterToEntitlementPriceFilter.js";

const customerProductTransition = ({
	fromProduct,
	toProduct,
}: {
	fromProduct?: Pick<FullProductWithoutLicenses, "internal_id">;
	toProduct?: Pick<FullProductWithoutLicenses, "internal_id">;
}): CustomerProductTransition | undefined => {
	if (!fromProduct || !toProduct) return undefined;
	return computeCustomerProductTransition({
		fromInternalProductId: fromProduct.internal_id,
		toInternalProductId: toProduct.internal_id,
	});
};

export const computePatchProductTransition = ({
	fromProduct,
	toProduct,
	removeItems,
	addEntitlementPrices,
}: {
	fromProduct?: Pick<FullProductWithoutLicenses, "internal_id">;
	toProduct?: Pick<FullProductWithoutLicenses, "internal_id">;
	removeItems?: PlanItemFilter[];
	addEntitlementPrices: EntitlementPrice[];
}): PatchProductTransition => {
	const { replaced, removed, leftoverAdds } = pairRemovedAndAddedPlanItems({
		removeItems: removeItems ?? [],
		addEntitlementPrices,
	});

	return {
		added: leftoverAdds,
		removed: removed.map(({ filter }) => ({
			filter: planItemFilterToEntitlementPriceFilter({ filter }),
		})),
		replaced: replaced.map((pair) => ({
			from: planItemFilterToEntitlementPriceFilter({ filter: pair.from }),
			to: pair.to,
		})),
		customerProduct: customerProductTransition({ fromProduct, toProduct }),
	};
};
