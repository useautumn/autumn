import type {
	AutumnBillingPlan,
	CreateScheduleBillingContext,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { buildAutumnLineItems } from "@/internal/billing/v2/compute/computeAutumnUtils/buildAutumnLineItems";
import { finalizeLineItems } from "@/internal/billing/v2/compute/finalize/finalizeLineItems";
import { billingContextToRecurringAndScheduled } from "../utils/billingContextToRecurringAndScheduled";
import { computeImmediatePhaseCustomerProducts } from "./computeImmediatePhaseCustomerProducts";
import { computeScheduledCustomerProducts } from "./computeScheduledCustomerProducts";

export type SchedulePhasePlan = {
	startsAt: number;
	customerProductIds: string[];
};

export type CreateSchedulePlanResult = {
	autumnBillingPlan: AutumnBillingPlan;
	phases: SchedulePhasePlan[];
};

/** Compute the full create_schedule billing plan (immediate + scheduled phases). */
export const computeCreateSchedulePlan = ({
	ctx,
	billingContext,
}: {
	ctx: AutumnContext;
	billingContext: CreateScheduleBillingContext;
}): CreateSchedulePlanResult => {
	const nextPhaseStartsAt = billingContext.futurePhases[0]?.starts_at;
	const {
		recurringActive: currentRecurringCustomerProducts,
		recurringScheduled: existingScheduledCustomerProducts,
	} = billingContextToRecurringAndScheduled({ billingContext });

	const immediate = computeImmediatePhaseCustomerProducts({
		ctx,
		billingContext,
		currentRecurringCustomerProducts,
		nextPhaseStartsAt,
	});

	const scheduled = computeScheduledCustomerProducts({
		ctx,
		billingContext,
		existingScheduledCustomerProducts,
	});

	const allInsertCustomerProducts = [
		...immediate.insertCustomerProducts,
		...scheduled.insertCustomerProducts,
	];

	const { allLineItems, updateCustomerEntitlements } = buildAutumnLineItems({
		ctx,
		newCustomerProducts: immediate.insertCustomerProducts,
		deletedCustomerProducts: currentRecurringCustomerProducts,
		billingContext,
		includeArrearLineItems: currentRecurringCustomerProducts.length > 0,
	});

	const autumnBillingPlan: AutumnBillingPlan = {
		customerId:
			billingContext.fullCustomer.id ?? billingContext.fullCustomer.internal_id,
		insertCustomerProducts: allInsertCustomerProducts,
		updateCustomerProducts: immediate.updateCustomerProducts,
		deleteCustomerProducts: scheduled.deleteCustomerProducts,
		customPrices: billingContext.customPrices,
		customEntitlements: billingContext.customEnts,
		customFreeTrial: billingContext.trialContext?.customFreeTrial,
		lineItems: allLineItems,
		updateCustomerEntitlements,
	};

	autumnBillingPlan.lineItems = finalizeLineItems({
		ctx,
		lineItems: autumnBillingPlan.lineItems ?? [],
		billingContext,
		autumnBillingPlan,
	});

	const immediatePhase: SchedulePhasePlan = {
		startsAt: billingContext.immediatePhase.starts_at,
		customerProductIds: immediate.insertCustomerProducts.map(
			(customerProduct) => customerProduct.id,
		),
	};

	return {
		autumnBillingPlan,
		phases: [immediatePhase, ...scheduled.scheduledPhases],
	};
};
