import type {
	BillingContext,
	BillingPlan,
	CreateScheduleBillingContext,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { findOutOfScopeCustomerProductIds } from "../subscriptionScope/findOutOfScopeCustomerProductIds";
import { persistSetPlansSchedule } from "./persistSetPlansSchedule";
import { resolveUnscheduledProductContexts } from "./unscheduledProductContexts";

export const isSetPlansBillingContext = (
	billingContext: BillingContext,
): billingContext is CreateScheduleBillingContext =>
	"immediatePhase" in billingContext &&
	"scheduledPhaseContexts" in billingContext;

/** Plans deferred before `schedulePhases` existed: every phase plan was a fresh row. */
const legacyDeferredSchedulePhases = ({
	billingContext,
	billingPlan,
}: {
	billingContext: CreateScheduleBillingContext;
	billingPlan: BillingPlan;
}) => {
	const allCustomerProductIds = billingPlan.autumn.insertCustomerProducts.map(
		(customerProduct) => customerProduct.id,
	);
	const phaseSizes = [
		{
			startsAt: billingContext.immediatePhase.starts_at,
			prorationBehavior: null,
			count: billingContext.productContexts.length,
		},
		...billingContext.scheduledPhaseContexts.map((phaseContext) => ({
			startsAt: phaseContext.startsAt,
			prorationBehavior: phaseContext.prorationBehavior ?? null,
			count: phaseContext.productContexts.length,
		})),
	];

	// Unscheduled plans are attached last within the immediate phase and belong to
	// no phase, so they are dropped from the opening phase's products.
	const unscheduledCount = resolveUnscheduledProductContexts({
		productContexts: billingContext.productContexts,
	}).length;

	let currentIndex = 0;
	const phases = phaseSizes.map((phase, index) => {
		const customerProductIds = allCustomerProductIds.slice(
			currentIndex,
			currentIndex + phase.count - (index === 0 ? unscheduledCount : 0),
		);
		currentIndex += phase.count;

		return {
			startsAt: phase.startsAt,
			prorationBehavior: phase.prorationBehavior,
			customerProductIds,
		};
	});

	if (currentIndex !== allCustomerProductIds.length) {
		throw new Error("Deferred set_plans phases did not match billing plan");
	}

	return phases;
};

export const deferredSetPlansSchedulePhases = ({
	billingContext,
	billingPlan,
}: {
	billingContext: CreateScheduleBillingContext;
	billingPlan: BillingPlan;
}) =>
	billingPlan.autumn.schedulePhases ??
	legacyDeferredSchedulePhases({ billingContext, billingPlan });

export const persistDeferredSetPlansSchedule = async ({
	ctx,
	billingContext,
	billingPlan,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	billingPlan: BillingPlan;
}) => {
	if (!isSetPlansBillingContext(billingContext)) {
		return;
	}

	await persistSetPlansSchedule({
		ctx,
		customerId:
			billingContext.fullCustomer.id ?? billingContext.fullCustomer.internal_id,
		currentEpochMs: Date.now(),
		fullCustomer: billingContext.fullCustomer,
		phases: deferredSetPlansSchedulePhases({
			billingContext,
			billingPlan,
		}),
		preservedCustomerProductIds: findOutOfScopeCustomerProductIds({
			billingContext,
		}),
	});
};
