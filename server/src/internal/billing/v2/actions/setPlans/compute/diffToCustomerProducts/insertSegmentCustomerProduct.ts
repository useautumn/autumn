import type {
	CreateScheduleBillingContext,
	FullCusProduct,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { computeAttachNewCustomerProduct } from "@/internal/billing/v2/actions/attach/compute/computeAttachNewCustomerProduct";
import { productContextToAttachBillingContext } from "@/internal/billing/v2/utils/billingContext/productContextToAttachBillingContext";
import { applyScheduleTimingToCustomerProductPlan } from "@/internal/billing/v2/utils/billingPlan/customerProductPlanMutations";
import { initScheduledCustomerProduct } from "@/internal/billing/v2/utils/initFullCustomerProduct/initScheduledCustomerProduct";
import type { ResolvedSegment } from "../../timeline/types/timelineDiff";

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

/** A plan starting now is attached like any immediate plan, carrying over the row it replaces. */
const insertImmediateCustomerProduct = ({
	ctx,
	billingContext,
	productContext,
	segment,
	replacedCustomerProduct,
}: {
	ctx: AutumnContext;
	billingContext: CreateScheduleBillingContext;
	productContext: CreateScheduleBillingContext["productContexts"][number];
	segment: ResolvedSegment;
	replacedCustomerProduct?: FullCusProduct;
}): FullCusProduct => {
	const attachBillingContext = productContextToAttachBillingContext({
		billingContext,
		productContext,
		currentCustomerProductOverride: replacedCustomerProduct,
	});
	const customerProduct = computeAttachNewCustomerProduct({
		ctx,
		attachBillingContext,
		params: { no_billing_changes: billingContext.skipBillingChanges },
	});

	if (replacedCustomerProduct) {
		customerProduct.starts_at = replacedCustomerProduct.starts_at;
	}
	applyScheduleTimingToCustomerProductPlan({
		result: { insertCustomerProduct: customerProduct },
		endedAt: segment.endsAt,
	});
	if (billingContext.skipBillingChanges) {
		customerProduct.scheduled_ids =
			attachBillingContext.currentCustomerProduct?.scheduled_ids;
	}
	return customerProduct;
};

/** The row the request inserts for a segment it doesn't find running. */
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
}): FullCusProduct => {
	const found = findProductContext({ billingContext, segment });
	if (found.type === "immediate") {
		return insertImmediateCustomerProduct({
			ctx,
			billingContext,
			productContext: found.productContext,
			segment,
			replacedCustomerProduct,
		});
	}

	const { phaseContext, productContext } = found;
	// Scope comes from the inherited entity, never the request entity, so a
	// customer-level plan stays customer-level in later phases.
	return initScheduledCustomerProduct({
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
				? segment.startsAt
				: null,
	});
};
