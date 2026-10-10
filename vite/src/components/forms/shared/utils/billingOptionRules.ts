import { TRIAL_ANCHORS_BILLING_CYCLE_REASON } from "@autumn/shared";

export type BillingFlow = "attach" | "update" | "schedule";

export type BillingOptionId =
	| "discounts"
	| "proration"
	| "planSchedule"
	| "resetBillingCycle"
	| "resetUsage"
	| "skipBilling"
	| "startDate"
	| "endDate"
	| "carryOverBalances"
	| "carryOverUsages"
	| "overrideLineItems"
	| "newBillingSubscription";

export type BillingOptionRule = {
	visible: boolean;
	disabled: boolean;
	/** Shown as a tooltip when present; a rule can be disabled without one. */
	disabledReason: string | null;
};

export type BillingOptionRules = Record<BillingOptionId, BillingOptionRule>;

/** Everything any flow needs to decide visibility. Each flow fills its own subset. */
export type BillingOptionState = {
	hasActiveSubscription?: boolean;
	isMultiPlan?: boolean;
	// attach
	showProrationRow?: boolean;
	showProrationBehavior?: boolean;
	isNoChargesAllowed?: boolean;
	hasCustomerEntitlements?: boolean;
	canChooseBillingCycle?: boolean;
	showStartDate?: boolean;
	showEndDate?: boolean;
	// schedule
	hasPaidRecurringPlan?: boolean;
	carriesUsageNow?: boolean;
	trialAnchorsBillingCycle?: boolean;
};

const HIDDEN: BillingOptionRule = {
	visible: false,
	disabled: false,
	disabledReason: null,
};

const show = (
	visible: boolean,
	disabledReason: string | null = null,
): BillingOptionRule => ({
	visible,
	disabled: disabledReason !== null,
	disabledReason,
});

/** Disabled with no explanatory tooltip. */
const showDisabledSilently = (
	visible: boolean,
	disabled: boolean,
): BillingOptionRule => ({ visible, disabled, disabledReason: null });

// A multi-plan attach hides the options its request body doesn't send.
function attachRules(state: BillingOptionState): BillingOptionRules {
	const singlePlanOnly = !state.isMultiPlan;
	return {
		discounts: show(true),
		proration: showDisabledSilently(
			!!state.showProrationRow,
			!state.showProrationBehavior || !state.isNoChargesAllowed,
		),
		planSchedule: show(!!state.hasActiveSubscription && !state.isMultiPlan),
		startDate: show(!!state.showStartDate),
		endDate: show(singlePlanOnly && !!state.showEndDate),
		carryOverBalances: show(singlePlanOnly && !!state.hasCustomerEntitlements),
		carryOverUsages: show(singlePlanOnly && !!state.hasCustomerEntitlements),
		overrideLineItems: show(singlePlanOnly),
		newBillingSubscription: show(!!state.canChooseBillingCycle),
		resetBillingCycle: show(!!state.hasActiveSubscription),
		skipBilling: show(singlePlanOnly),
		resetUsage: HIDDEN,
	};
}

function updateRules(state: BillingOptionState): BillingOptionRules {
	const onActiveSub = show(!!state.hasActiveSubscription);
	return {
		discounts: show(true),
		proration: onActiveSub,
		resetBillingCycle: onActiveSub,
		resetUsage: onActiveSub,
		skipBilling: onActiveSub,
		planSchedule: HIDDEN,
		startDate: HIDDEN,
		endDate: HIDDEN,
		carryOverBalances: HIDDEN,
		carryOverUsages: HIDDEN,
		overrideLineItems: HIDDEN,
		newBillingSubscription: HIDDEN,
	};
}

function scheduleRules(state: BillingOptionState): BillingOptionRules {
	return {
		proration: show(true),
		resetBillingCycle: show(
			true,
			state.trialAnchorsBillingCycle
				? TRIAL_ANCHORS_BILLING_CYCLE_REASON
				: null,
		),
		discounts: show(true),
		planSchedule: HIDDEN,
		resetUsage: HIDDEN,
		skipBilling: HIDDEN,
		startDate: HIDDEN,
		endDate: show(!!state.hasPaidRecurringPlan),
		carryOverBalances: HIDDEN,
		// set_plans rejects carry-over unless the first phase replaces a plan or resets the cycle now.
		carryOverUsages: show(!!state.carriesUsageNow),
		overrideLineItems: HIDDEN,
		newBillingSubscription: HIDDEN,
	};
}

/** Single source of truth for which billing options a sheet exposes. */
export function getBillingOptionRules({
	flow,
	state,
}: {
	flow: BillingFlow;
	state: BillingOptionState;
}): BillingOptionRules {
	if (flow === "attach") return attachRules(state);
	if (flow === "update") return updateRules(state);
	return scheduleRules(state);
}
