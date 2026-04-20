import type {
	BillingContext,
	BillingPlan,
	CreateScheduleBillingContext,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { persistCreateSchedule } from "./persistCreateSchedule";

const isCreateScheduleBillingContext = (
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

	let currentIndex = 0;
	const phases = phaseSizes.map((phase) => {
		const customerProductIds = allCustomerProductIds.slice(
			currentIndex,
			currentIndex + phase.count,
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
