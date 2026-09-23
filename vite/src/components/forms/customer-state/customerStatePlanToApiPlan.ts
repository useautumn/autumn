import type { Feature, ProductV2 } from "@autumn/shared";
import { buildBillingPlan } from "@/components/forms/shared/utils/buildPlanCustomize";
import type { CustomerStatePlan } from "./customerStateSchema";

/** A customer-state row as an API plan: plan id, scope, quantities, customize. */
export const customerStatePlanToApiPlan = ({
	plan,
	products,
	features,
}: {
	plan: CustomerStatePlan;
	products: ProductV2[];
	features: Feature[];
}) =>
	buildBillingPlan({
		productId: plan.productId,
		prepaidOptions: plan.prepaidOptions,
		items: plan.items,
		addLicenses: plan.addLicenses,
		version: plan.version,
		isCustom: plan.isCustom,
		entityId: plan.entityId ?? null,
		product: products.find((product) => product.id === plan.productId),
		features,
	});
