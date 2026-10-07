import type {
	AttachBillingContext,
	CreateScheduleBillingContext,
	FullCusProduct,
	FullCustomerEntitlement,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computeAttachNewCustomerProduct } from "@/internal/billing/v2/actions/attach/compute/computeAttachNewCustomerProduct";
import { productContextToAttachBillingContext } from "@/internal/billing/v2/utils/billingContext/productContextToAttachBillingContext";
import { applyScheduleTimingToCustomerProductPlan } from "@/internal/billing/v2/utils/billingPlan/customerProductPlanMutations";
import { initScheduledCustomerProduct } from "@/internal/billing/v2/utils/initFullCustomerProduct/initScheduledCustomerProduct";
import { firstPhaseStartsInFuture } from "../../setup/classifyFirstPhaseStart";
import { startsInFuture } from "../../timeline/timelineGuards";
import type { ResolvedSegment } from "../../timeline/types/timelineDiff";
import { isBackdateRecreate } from "../../utils/isBackdateRecreate";
import { keptUsageCarryOverUsages } from "../keptUsageCarryOverUsages";
import { keptUsageCustomerEntitlements } from "../keptUsageCustomerEntitlements";

const findProductContext = ({
	billingContext,
	segment,
}: {
	billingContext: CreateScheduleBillingContext;
	segment: ResolvedSegment;
}) => {
	const source = segment.desired?.source;
	if (!source) {
		throw new Error(`set_plans cannot insert ${segment.id}: no requested plan`);
	}
	if (source.type === "ongoing" || source.phaseIndex === 0) {
		const productContext = billingContext.productContexts[source.planIndex];
		if (productContext) return { type: "immediate" as const, productContext };
	} else {
		const phaseContext =
			billingContext.scheduledPhaseContexts[source.phaseIndex - 1];
		const productContext = phaseContext?.productContexts[source.planIndex];
		if (phaseContext && productContext) {
			return { type: "scheduled" as const, phaseContext, productContext };
		}
	}
	throw new Error(`set_plans cannot find the requested plan for ${segment.id}`);
};

/** A plan starting later waits like a scheduled one unless early access opens it; an ongoing one under a later first phase runs from now. */
const firstPhaseTiming = ({
	billingContext,
	startsLater,
}: {
	billingContext: CreateScheduleBillingContext;
	startsLater: boolean;
}): Partial<AttachBillingContext> => {
	if (startsLater) {
		return billingContext.accessStartsAt === undefined
			? { planTiming: "end_of_cycle" }
			: {};
	}
	if (!firstPhaseStartsInFuture({ billingContext })) return {};

	return {
		billingStartsAt: undefined,
		accessStartsAt: undefined,
		resetCycleAnchorMs: "now",
	};
};

/** A first-phase plan is attached like any immediate plan, carrying over the row it replaces. */
const insertImmediateCustomerProduct = ({
	ctx,
	billingContext,
	productContext,
	segment,
	replacedCustomerProduct,
	keptCustomerEntitlements,
}: {
	ctx: AutumnContext;
	billingContext: CreateScheduleBillingContext;
	productContext: CreateScheduleBillingContext["productContexts"][number];
	segment: ResolvedSegment;
	replacedCustomerProduct?: FullCusProduct;
	keptCustomerEntitlements: FullCustomerEntitlement[];
}): FullCusProduct => {
	const startsLater = startsInFuture({
		segment,
		now: billingContext.currentEpochMs,
	});
	const attachBillingContext: AttachBillingContext = {
		...productContextToAttachBillingContext({
			billingContext,
			productContext,
			currentCustomerProductOverride: replacedCustomerProduct,
		}),
		...firstPhaseTiming({ billingContext, startsLater }),
	};
	const carryOverUsages =
		replacedCustomerProduct && !startsLater
			? keptUsageCarryOverUsages({
					replacedCustomerProduct,
					keptCustomerEntitlements,
				})
			: undefined;
	const customerProduct = computeAttachNewCustomerProduct({
		ctx,
		attachBillingContext,
		params: {
			no_billing_changes: billingContext.skipBillingChanges,
			carry_over_usages: carryOverUsages,
		},
	});

	if (replacedCustomerProduct && !startsLater) {
		customerProduct.starts_at = isBackdateRecreate({ billingContext })
			? (billingContext.subscriptionBackdateStartMs ?? segment.startsAt)
			: replacedCustomerProduct.starts_at;
	}
	applyScheduleTimingToCustomerProductPlan({
		result: { insertCustomerProduct: customerProduct },
		endedAt: segment.endsAt,
	});
	// Stripe keeps a pending cancellation through an item update, so the recreated row stays canceling.
	if (segment.inheritsCancellation && replacedCustomerProduct) {
		customerProduct.canceled = true;
		customerProduct.canceled_at = replacedCustomerProduct.canceled_at;
	}
	if (billingContext.skipBillingChanges) {
		customerProduct.scheduled_ids =
			attachBillingContext.currentCustomerProduct?.scheduled_ids;
	}
	return customerProduct;
};

/** Usage rows a replacement starting now keeps from the row it replaces; a later start carries nothing yet. */
const keptCustomerEntitlementsFor = ({
	billingContext,
	segment,
	fullProduct,
	replacedCustomerProduct,
}: {
	billingContext: CreateScheduleBillingContext;
	segment: ResolvedSegment;
	fullProduct: CreateScheduleBillingContext["productContexts"][number]["fullProduct"];
	replacedCustomerProduct?: FullCusProduct;
}): FullCustomerEntitlement[] => {
	if (!replacedCustomerProduct) return [];
	if (startsInFuture({ segment, now: billingContext.currentEpochMs }))
		return [];
	return keptUsageCustomerEntitlements({
		billingContext,
		outgoingCustomerProduct: replacedCustomerProduct,
		incomingPrices: fullProduct.prices,
		incomingEntitlements: fullProduct.entitlements,
	});
};

/** The row the request inserts for a segment it doesn't find running, and the usage it keeps from the row it replaces. */
export const insertSegmentCustomerProduct = ({
	ctx,
	billingContext,
	segment,
	replacedCustomerProduct,
}: {
	ctx: AutumnContext;
	billingContext: CreateScheduleBillingContext;
	segment: ResolvedSegment;
	replacedCustomerProduct?: FullCusProduct;
}): {
	customerProduct: FullCusProduct;
	keptUsageCustomerEntitlements: FullCustomerEntitlement[];
} => {
	const found = findProductContext({ billingContext, segment });
	const keptCustomerEntitlements = keptCustomerEntitlementsFor({
		billingContext,
		segment,
		fullProduct: found.productContext.fullProduct,
		replacedCustomerProduct,
	});
	if (found.type === "immediate") {
		return {
			customerProduct: insertImmediateCustomerProduct({
				ctx,
				billingContext,
				productContext: found.productContext,
				segment,
				replacedCustomerProduct,
				keptCustomerEntitlements,
			}),
			keptUsageCustomerEntitlements: keptCustomerEntitlements,
		};
	}

	const { phaseContext, productContext } = found;
	// Scope comes from the inherited entity, never the request entity, so a
	// customer-level plan stays customer-level in later phases.
	return {
		customerProduct: initScheduledCustomerProduct({
			ctx,
			fullCustomer: {
				...billingContext.fullCustomer,
				entity: productContext.entity,
			},
			entity: productContext.entity,
			fullProduct: productContext.fullProduct,
			featureQuantities: productContext.featureQuantities,
			customerLicenseQuantities: productContext.customerLicenseQuantities,
			startsAt: segment.startsAt,
			endsAt: segment.endsAt,
			currentEpochMs: billingContext.currentEpochMs,
			externalId: productContext.externalId,
			billingCycleAnchorResetsAt:
				phaseContext.billingCycleAnchor === "phase_start"
					? phaseContext.startsAt
					: null,
		}),
		keptUsageCustomerEntitlements: keptCustomerEntitlements,
	};
};
