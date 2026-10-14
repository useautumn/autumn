import {
	isFreeProductV2,
	isOneOffProductV2,
	type ProductV2,
} from "@autumn/shared";
import type { CustomerStatePhase } from "@/components/forms/customer-state/customerStateSchema";

export const hasPaidRecurringSchedulePlan = ({
	phases,
	products,
}: {
	phases: CustomerStatePhase[];
	products: ProductV2[];
}) =>
	phases.some((phase) =>
		phase.plans.some((plan) => {
			const product = products.find(({ id }) => id === plan.productId);
			if (!product) return false;
			const items = plan.items ?? product.items;
			return !isFreeProductV2({ items }) && !isOneOffProductV2({ items });
		}),
	);
