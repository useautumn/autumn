import type {
	CreateScheduleBillingContext,
	FullCusProduct,
	SetPlansParamsV0,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import {
	billingContextToRequestedPhases,
	requestedEndsAt,
} from "../timeline/desiredTimeline/billingContextToRequestedPhases";
import { requestedPhasesToDesiredTimeline } from "../timeline/desiredTimeline/requestedPhasesToDesiredTimeline";
import type { RequestedPhase } from "../timeline/desiredTimeline/types/requestedPhase";
import { diffTimelines } from "../timeline/diffTimelines/diffTimelines";
import { createConfigInterner } from "../timeline/instanceConfig/createConfigInterner";
import { customerProductToGrantedLicenses } from "../timeline/instanceConfig/instanceConfigs";
import { customerProductsToTimelineRows } from "../timeline/savedTimeline/customerProductsToTimelineRows";
import { isInRequestScope } from "../timeline/savedTimeline/isInRequestScope";
import { rowsToSavedTimeline } from "../timeline/savedTimeline/rowsToSavedTimeline";
import type { SetPlansTimeline } from "../types/setPlansTimeline";
import { setupSetPlansPolicies } from "./setupSetPlansPolicies";

/** The request's scope: the request's own entity or customer, plus every scope a plan names. */
const representedScopesOf = ({
	billingContext,
	requestedPhases,
}: {
	billingContext: CreateScheduleBillingContext;
	requestedPhases: RequestedPhase[];
}) =>
	new Set<string | null>([
		billingContext.fullCustomer.entity?.internal_id ?? null,
		...requestedPhases.flatMap(({ plans }) =>
			plans.map(({ internalEntityId }) => internalEntityId),
		),
	]);

const scopedCustomerProducts = ({
	billingContext,
	requestedPhases,
}: {
	billingContext: CreateScheduleBillingContext;
	requestedPhases: RequestedPhase[];
}): FullCusProduct[] => {
	const representedScopes = representedScopesOf({
		billingContext,
		requestedPhases,
	});
	const stripeScopeIds = billingContext.stripeSubscriptionScope
		? new Set(billingContext.stripeSubscriptionScope.customerProductIds)
		: undefined;
	return billingContext.fullCustomer.customer_products.filter(
		(customerProduct) =>
			isInRequestScope({
				customerProductId: customerProduct.id,
				internalEntityId: customerProduct.internal_entity_id ?? null,
				stripeScopeCustomerProductIds: stripeScopeIds,
				representedScopes,
			}),
	);
};

/** Reads the saved and desired timelines once, then diffs them under the request's policies. */
export const setupSetPlansTimeline = ({
	ctx,
	billingContext,
	params,
}: {
	ctx: AutumnContext;
	billingContext: CreateScheduleBillingContext;
	params: Pick<SetPlansParamsV0, "undeclared_plans">;
}): SetPlansTimeline => {
	const now = billingContext.currentEpochMs;
	const requestedPhases = billingContextToRequestedPhases({
		billingContext,
		now,
	});
	const customerProducts = scopedCustomerProducts({
		billingContext,
		requestedPhases,
	});
	const interner = createConfigInterner({ features: ctx.features });

	const rows = customerProductsToTimelineRows({
		customerProducts,
		interner,
		liveStripeSubscriptionId: billingContext.stripeSubscription?.id,
		now,
	});
	const saved = rowsToSavedTimeline({ rows, now });
	const desired = requestedPhasesToDesiredTimeline({
		phases: requestedPhases,
		endsAt: requestedEndsAt({ billingContext }),
		saved,
		rows,
		grantedLicensesById: new Map(
			customerProducts.map((customerProduct) => [
				customerProduct.id,
				customerProductToGrantedLicenses(customerProduct),
			]),
		),
		interner,
		now,
	});
	const policies = setupSetPlansPolicies({ billingContext, params });

	const scopedIds = new Set(customerProducts.map(({ id }) => id));
	return {
		requestedPhases,
		saved,
		desired,
		policies,
		diff: diffTimelines({ saved, desired, policies, now }),
		outOfScopeCustomerProductIds: billingContext.fullCustomer.customer_products
			.filter(({ id }) => !scopedIds.has(id))
			.map(({ id }) => id),
	};
};
