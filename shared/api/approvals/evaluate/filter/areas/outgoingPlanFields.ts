import type { FullCusProduct } from "../../../../../models/cusProductModels/cusProductModels";
import { planFilterMatchesCustomerProduct } from "../../../../products/utils/match/planFilterMatchesCustomerProduct";
import { planFields } from "../fields/planFields";

/** Plans the customer already has, labelled by the caller's area (cancel calls them "Plan"). */
export const outgoingPlanFields = ({
	labels,
}: {
	labels: Record<string, string>;
}) =>
	planFields<FullCusProduct>({
		labels,
		matchesPlan: ({ filter, item }) =>
			planFilterMatchesCustomerProduct({ filter, cusProduct: item }),
		readPlanId: (item) => item.product_id,
		readVersion: (item) => item.product?.version ?? null,
	});
