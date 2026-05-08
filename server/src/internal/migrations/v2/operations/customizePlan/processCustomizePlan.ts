import type { UpdateSubscriptionBillingContext } from "@autumn/shared";
import type { CustomizePlanOp } from "@autumn/shared/api/migrations/operations/customer/customizePlan/index.js";
import { computeUpdateSubscriptionPlan } from "@/internal/billing/v2/actions/updateSubscription/compute/computeUpdateSubscriptionPlan.js";
import type { OperationProcessor } from "../types/index.js";
import {
	filterCustomerProductsByPlanFilter,
	mergeAutumnBillingPlans,
} from "../utils/index.js";
import { setupCustomizePlanProductContext } from "./setup/index.js";

export const processCustomizePlan = async ({
	ctx,
	context,
	op,
	plan,
	projectedFullCustomer,
}: Parameters<OperationProcessor<CustomizePlanOp>>[0]) => {
	const { customerProducts: matchedCustomerProducts } =
		filterCustomerProductsByPlanFilter({
			customerProducts: projectedFullCustomer.customer_products,
			planFilter: op.plan_filter,
		});

	let nextPlan = plan;
	const billingContexts: UpdateSubscriptionBillingContext[] = [];

	for (const customerProduct of matchedCustomerProducts) {
		const productContext = await setupCustomizePlanProductContext({
			ctx,
			context,
			op,
			projectedFullCustomer,
			customerProduct,
		});
		if (!productContext) continue;

		const computedPlan = await computeUpdateSubscriptionPlan({
			ctx,
			billingContext: productContext.billingContext,
			params: productContext.params,
		});

		nextPlan = mergeAutumnBillingPlans({
			base: nextPlan,
			incoming: computedPlan,
		});
		billingContexts.push(productContext.billingContext);
	}

	return {
		plan: nextPlan,
		projectedFullCustomer,
		matchedCustomerProducts: matchedCustomerProducts.length,
		billingContexts,
	};
};
