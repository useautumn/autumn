import {
	type AutumnBillingPlan,
	ErrCode,
	type FullCustomer,
	type MultiUpdateItemV0,
	type MultiUpdateParamsV0,
	RecaseError,
	type UpdateSubscriptionBillingContext,
	type UpdateSubscriptionV1Params,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computeUpdateSubscriptionPlan } from "@/internal/billing/v2/actions/updateSubscription/compute/computeUpdateSubscriptionPlan";
import { setupUpdateSubscriptionBillingContext } from "@/internal/billing/v2/actions/updateSubscription/setup/setupUpdateSubscriptionBillingContext";
import { applyAutumnBillingPlanToFullCustomer } from "@/internal/billing/v2/utils/autumnBillingPlanToFinalFullCustomer";
import { mergeAutumnBillingPlans } from "@/internal/billing/v2/utils/billingPlan/mergeAutumnBillingPlans";
import {
	multiUpdateItemToParams,
	narrowFullCustomerToEntity,
} from "../setup/setupMultiUpdateItemParams";

export type MultiUpdateItemResult = {
	item: MultiUpdateItemV0;
	params: UpdateSubscriptionV1Params;
	billingContext: UpdateSubscriptionBillingContext;
	itemPlan: AutumnBillingPlan;
};

export type MultiUpdateFoldResult = {
	autumnBillingPlan: AutumnBillingPlan;
	itemResults: MultiUpdateItemResult[];
};

/**
 * Fold each update onto one AutumnBillingPlan in request order. Each update's
 * context is built against the customer state projected from all prior updates,
 * so cancel side effects (scheduled deletions, default inserts, un-cancels)
 * compose deterministically.
 */
export const computeMultiUpdateFold = async ({
	ctx,
	params,
	fullCustomer,
	preview,
}: {
	ctx: AutumnContext;
	params: MultiUpdateParamsV0;
	fullCustomer: FullCustomer;
	preview: boolean;
}): Promise<MultiUpdateFoldResult> => {
	let plan: AutumnBillingPlan = {
		customerId: fullCustomer.id ?? fullCustomer.internal_id,
		insertCustomerProducts: [],
	};
	let projectedFullCustomer = fullCustomer;
	const itemResults: MultiUpdateItemResult[] = [];
	const targetedCustomerProductIds = new Set<string>();

	for (const item of params.updates) {
		const itemParams = multiUpdateItemToParams({ params, item });
		const itemFullCustomer = narrowFullCustomerToEntity({
			fullCustomer: projectedFullCustomer,
			entityId: itemParams.entity_id,
		});

		const billingContext = await setupUpdateSubscriptionBillingContext({
			ctx,
			params: itemParams,
			preview,
			contextOverride: { projectedFullCustomer: itemFullCustomer },
		});

		const targetId = billingContext.customerProduct.id;
		if (targetedCustomerProductIds.has(targetId)) {
			throw new RecaseError({
				code: ErrCode.InvalidRequest,
				statusCode: 400,
				message: `Multiple updates target the same plan (${billingContext.customerProduct.product.id}). Combine them into a single update.`,
			});
		}
		targetedCustomerProductIds.add(targetId);

		const itemPlan = await computeUpdateSubscriptionPlan({
			ctx,
			billingContext,
			params: itemParams,
		});

		plan = mergeAutumnBillingPlans({ base: plan, incoming: itemPlan });
		projectedFullCustomer = applyAutumnBillingPlanToFullCustomer({
			fullCustomer,
			autumnBillingPlan: plan,
		});

		itemResults.push({ item, params: itemParams, billingContext, itemPlan });
	}

	return { autumnBillingPlan: plan, itemResults };
};
