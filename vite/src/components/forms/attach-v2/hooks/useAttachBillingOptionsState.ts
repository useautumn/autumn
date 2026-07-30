import {
	type BillingBehavior,
	BillingInterval,
	CusProductStatus,
	type FullCusProduct,
	hasActivePaidSubscription,
	type PlanTiming,
} from "@autumn/shared";
import { useCallback, useEffect } from "react";
import type { AttachForm } from "../attachFormSchema";
import type { UseAttachForm } from "./useAttachForm";
import type { UseAttachPreviewReturn } from "./useAttachPreview";
import {
	getNoChargesDisabledReason,
	isNoChargesAllowedForAttach,
	normalizeAttachProrationBehavior,
} from "../utils/attachProrationBehaviorRules";

/** Encapsulates planSchedule + prorationBehavior derived state and mutations. */
export function useAttachBillingOptionsState({
	form,
	formValues,
	previewQuery,
	customerProducts,
	isFreeToPaidTransition,
	hasActiveSubscription,
	isMultiPlan,
}: {
	form: UseAttachForm;
	formValues: AttachForm;
	previewQuery: UseAttachPreviewReturn;
	customerProducts: FullCusProduct[];
	isFreeToPaidTransition: boolean;
	hasActiveSubscription: boolean;
	isMultiPlan: boolean;
}) {
	const { planSchedule, prorationBehavior, newBillingSubscription, startDate } =
		formValues;
	const previewData = previewQuery.data;

	const hasActiveProductWithTrial = customerProducts.some(
		(customerProduct) =>
			customerProduct.status === CusProductStatus.Trialing &&
			(customerProduct.subscription_ids?.length ?? 0) > 0 &&
			!!customerProduct.free_trial_id,
	);

	const hasPaidRecurringSubscription = hasActivePaidSubscription({
		customerProducts,
	});

	const hasOutgoing = (previewData?.outgoing.length ?? 0) > 0;
	const incomingPlans = previewData?.incoming ?? [];
	const outgoingPlan = previewData?.outgoing[0]?.plan;

	// Multi-plan attaches produce several incoming changes, so these ask "does
	// any incoming plan…" rather than inspecting only the first.
	const isPaidRecurringAttach = incomingPlans.some(
		(change) =>
			(change.plan?.price?.amount ?? 0) > 0 &&
			change.plan?.price?.interval !== BillingInterval.OneOff,
	);

	const isOutgoingPaidRecurring =
		(outgoingPlan?.price?.amount ?? 0) > 0 &&
		outgoingPlan?.price?.interval !== BillingInterval.OneOff;

	const createsNewStripeSubscription =
		!hasActiveSubscription || newBillingSubscription;

	// Usage-only plans have a null base price (billing lives on items), so a
	// recurring sub can be created even when the base price and immediate total are $0.
	const incomingPlanHasRecurringPrice = incomingPlans.some(
		(change) =>
			(change.plan?.price != null &&
				change.plan.price.interval !== BillingInterval.OneOff) ||
			(change.plan?.items?.some(
				(item: { price?: { interval?: BillingInterval | null } | null }) =>
					item.price != null && item.price.interval !== BillingInterval.OneOff,
			) ??
				false),
	);

	const createsRecurringSubscription =
		incomingPlanHasRecurringPrice && createsNewStripeSubscription;

	const isDirectPaidTransition =
		hasOutgoing && isPaidRecurringAttach && isOutgoingPaidRecurring;

	const canChooseBillingCycle =
		isPaidRecurringAttach &&
		hasPaidRecurringSubscription &&
		!isDirectPaidTransition;

	// Always default to immediate; users can opt into end-of-cycle explicitly.
	const defaultPlanSchedule: PlanTiming = "immediate";

	const effectivePlanSchedule = !hasOutgoing
		? "immediate"
		: (planSchedule ?? defaultPlanSchedule);

	const hasSubscriptionToProrate =
		hasActiveSubscription && !hasActiveProductWithTrial;
	const showProrationRow = !isMultiPlan && hasSubscriptionToProrate;

	const freeToPaidWithNoExistingSubscription =
		isFreeToPaidTransition && !hasActiveSubscription;

	const showProrationBehavior =
		showProrationRow && effectivePlanSchedule === "immediate";
	const isNoChargesAllowed = isNoChargesAllowedForAttach({
		newBillingSubscription,
		disableProration: freeToPaidWithNoExistingSubscription,
	});
	const normalizedProrationBehavior = normalizeAttachProrationBehavior({
		prorationBehavior,
		newBillingSubscription,
		disableProration: freeToPaidWithNoExistingSubscription,
	});
	const effectiveProrationBehavior =
		normalizedProrationBehavior ??
		(isNoChargesAllowed ? "none" : "prorate_immediately");
	const noChargesDisabledReason = getNoChargesDisabledReason({
		newBillingSubscription,
		disableProration: freeToPaidWithNoExistingSubscription,
	});

	const hasCustomSchedule =
		planSchedule !== null && planSchedule !== defaultPlanSchedule;
	const hasCustomProration =
		showProrationBehavior &&
		normalizedProrationBehavior !== null &&
		normalizedProrationBehavior !== "none";

	const hasResolvedPlanSchedule =
		planSchedule !== null || previewData !== undefined;
	const isImmediateSelected =
		hasResolvedPlanSchedule && effectivePlanSchedule === "immediate";
	const isEndOfCycleSelected =
		hasResolvedPlanSchedule && effectivePlanSchedule === "end_of_cycle";
	const movePastStartDateToNow = useCallback(() => {
		if (startDate !== null && startDate < Date.now()) {
			form.setFieldValue("startDate", Date.now());
		}
	}, [form, startDate]);

	useEffect(() => {
		if (isMultiPlan) return;
		if (canChooseBillingCycle) return;
		if (!newBillingSubscription) return;
		form.setFieldValue("newBillingSubscription", false);
		movePastStartDateToNow();
	}, [
		canChooseBillingCycle,
		form,
		movePastStartDateToNow,
		newBillingSubscription,
		isMultiPlan,
	]);

	useEffect(() => {
		if (isMultiPlan) return;
		if (showProrationBehavior) return;
		if (prorationBehavior === null) return;
		form.setFieldValue("prorationBehavior", null);
	}, [showProrationBehavior, prorationBehavior, form, isMultiPlan]);

	useEffect(() => {
		if (isMultiPlan) return;
		if (!showProrationBehavior) return;
		if (prorationBehavior !== null) return;
		if (!isNoChargesAllowed) return;
		form.setFieldValue("prorationBehavior", "none");
	}, [
		showProrationBehavior,
		prorationBehavior,
		isNoChargesAllowed,
		form,
		isMultiPlan,
	]);

	useEffect(() => {
		if (isMultiPlan) return;
		if (prorationBehavior !== "none") return;
		if (isNoChargesAllowed) return;
		form.setFieldValue("prorationBehavior", null);
	}, [prorationBehavior, form, isNoChargesAllowed, isMultiPlan]);

	const handleScheduleChange = (value: PlanTiming) => {
		form.setFieldValue("planSchedule", value);
		if (value !== "immediate") {
			form.setFieldValue("prorationBehavior", null);
		}
		if (value === "end_of_cycle" && startDate !== null) {
			form.setFieldValue("startDate", null);
		}
	};

	const handleBillingCycleChange = ({
		createNewCycle,
	}: {
		createNewCycle: boolean;
	}) => {
		form.setFieldValue("newBillingSubscription", createNewCycle);
		if (!createNewCycle) movePastStartDateToNow();
		form.setFieldValue(
			"prorationBehavior",
			normalizeAttachProrationBehavior({
				prorationBehavior,
				newBillingSubscription: createNewCycle,
				disableProration: freeToPaidWithNoExistingSubscription,
			}),
		);
	};

	const handleProrationBehaviorChange = (value: BillingBehavior) => {
		form.setFieldValue(
			"prorationBehavior",
			normalizeAttachProrationBehavior({
				prorationBehavior: value,
				newBillingSubscription,
				disableProration: freeToPaidWithNoExistingSubscription,
			}),
		);
	};

	return {
		hasActiveSubscription,
		hasOutgoing,
		hasPaidRecurringSubscription,
		canChooseBillingCycle,
		createsNewStripeSubscription,
		createsRecurringSubscription,
		defaultPlanSchedule,
		effectivePlanSchedule,
		showProrationRow,
		showProrationBehavior,
		effectiveProrationBehavior,
		hasCustomSchedule,
		hasCustomProration,
		isImmediateSelected,
		isEndOfCycleSelected,
		isNoChargesAllowed,
		noChargesDisabledReason,
		handleScheduleChange,
		handleBillingCycleChange,
		handleProrationBehaviorChange,
	};
}

export type UseAttachBillingOptionsStateReturn = ReturnType<
	typeof useAttachBillingOptionsState
>;
