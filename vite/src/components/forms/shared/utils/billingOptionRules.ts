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
	| "newBillingSubscription"
	| "enablePlanImmediately";

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
	hasMultipleImmediatePlans?: boolean;
	canResetScheduleBillingCycle?: boolean;
	isCheckoutRedirect?: boolean;
};

const MULTI_ATTACH_UNSUPPORTED = "Not yet supported for multi attach";

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

function attachRules(state: BillingOptionState): BillingOptionRules {
	const inMoreOptions = !state.isMultiPlan;
	return {
		discounts: show(true),
		proration: showDisabledSilently(
			!!state.showProrationRow,
			!state.showProrationBehavior || !state.isNoChargesAllowed,
		),
		planSchedule: show(!!state.hasActiveSubscription && !state.isMultiPlan),
		startDate: show(inMoreOptions && !!state.showStartDate),
		endDate: show(inMoreOptions && !!state.showEndDate),
		carryOverBalances: show(inMoreOptions && !!state.hasCustomerEntitlements),
		carryOverUsages: show(inMoreOptions && !!state.hasCustomerEntitlements),
		overrideLineItems: show(inMoreOptions),
		newBillingSubscription: show(
			inMoreOptions && !!state.canChooseBillingCycle,
		),
		resetBillingCycle: show(inMoreOptions && !!state.hasActiveSubscription),
		skipBilling: show(inMoreOptions),
		resetUsage: HIDDEN,
		enablePlanImmediately: HIDDEN,
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
		enablePlanImmediately: HIDDEN,
	};
}

function scheduleRules(state: BillingOptionState): BillingOptionRules {
	const multiPlanBlocked = !!state.hasMultipleImmediatePlans;
	return {
		proration: show(true, multiPlanBlocked ? MULTI_ATTACH_UNSUPPORTED : null),
		resetBillingCycle: show(
			true,
			multiPlanBlocked && !state.canResetScheduleBillingCycle
				? MULTI_ATTACH_UNSUPPORTED
				: null,
		),
		enablePlanImmediately: show(!!state.isCheckoutRedirect),
		discounts: HIDDEN,
		planSchedule: HIDDEN,
		resetUsage: HIDDEN,
		skipBilling: HIDDEN,
		startDate: HIDDEN,
		endDate: HIDDEN,
		carryOverBalances: HIDDEN,
		carryOverUsages: HIDDEN,
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
