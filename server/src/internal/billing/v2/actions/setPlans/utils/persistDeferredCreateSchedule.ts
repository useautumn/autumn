import type {
	BillingContext,
	BillingPlan,
	CreateScheduleBillingContext,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { persistCreateSchedule } from "./persistCreateSchedule";
import { resolveUnscheduledProductContexts } from "./unscheduledProductContexts";

export const isCreateScheduleBillingContext = (
	billingContext: BillingContext,
): billingContext is CreateScheduleBillingContext =>
	"immediatePhase" in billingContext &&
	"scheduledPhaseContexts" in billingContext;

const buildDeferredSchedulePhases = ({
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
			count: billingContext.productContexts.length,
		},
		...billingContext.scheduledPhaseContexts.map((phaseContext) => ({
			startsAt: phaseContext.startsAt,
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
			customerProductIds,
		};
	});

	if (currentIndex !== allCustomerProductIds.length) {
		throw new Error(
			"Deferred create_schedule phases did not match billing plan",
		);
	}

	return phases;
};

export const persistDeferredCreateSchedule = async ({
	ctx,
	billingContext,
	billingPlan,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	billingPlan: BillingPlan;
}) => {
	if (!isCreateScheduleBillingContext(billingContext)) {
		return;
	}

	await persistCreateSchedule({
		ctx,
		customerId:
			billingContext.fullCustomer.id ?? billingContext.fullCustomer.internal_id,
		currentEpochMs: Date.now(),
		fullCustomer: billingContext.fullCustomer,
		phases: buildDeferredSchedulePhases({
			billingContext,
			billingPlan,
		}),
	});
};
