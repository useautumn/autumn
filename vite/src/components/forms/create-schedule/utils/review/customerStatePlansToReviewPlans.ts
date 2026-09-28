import type { ProductV2 } from "@autumn/shared";
import type { CustomerStatePlan } from "@/components/forms/customer-state/customerStateSchema";
import type { ReviewPlan } from "./types/reviewChange";

/** Form plans as review plans, each product carrying the plan's custom items when set. */
export const customerStatePlansToReviewPlans = ({
	plans,
	products,
	productForDisplay,
}: {
	plans: CustomerStatePlan[];
	products: ProductV2[];
	productForDisplay: (product: ProductV2) => ProductV2;
}): ReviewPlan[] =>
	plans
		.filter((plan) => plan.productId)
		.map((plan) => {
			const product = products.find(({ id }) => id === plan.productId);
			return {
				planId: plan.productId,
				entityId: plan.entityId ?? null,
				product:
					product &&
					productForDisplay({ ...product, items: plan.items ?? product.items }),
			};
		});
