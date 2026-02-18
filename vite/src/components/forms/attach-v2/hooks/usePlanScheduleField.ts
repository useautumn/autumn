import {
	ACTIVE_STATUSES,
	type BillingBehavior,
	BillingInterval,
	type CusProduct,
	CusProductStatus,
	cusProductToPrices,
	isFreeProduct,
	isOneOffProduct,
	type PlanTiming,
} from "@autumn/shared";
import { useEffect, useMemo } from "react";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { useAttachFormContext } from "../context/AttachFormProvider";
import {
	getNoChargesDisabledReason,
	isNoChargesAllowedForAttach,
	normalizeAttachBillingBehavior,
} from "../utils/attachBillingBehaviorRules";

/** Encapsulates planSchedule + billingBehavior derived state and mutations. */
export function usePlanScheduleField() {
	const { form, formValues, previewQuery } = useAttachFormContext();
	const { planSchedule, billingBehavior, newBillingSubscription } = formValues;
	const previewData = previewQuery.data;
	const { customer } = useCusQuery();

	const hasActiveSubscription = useMemo(
		() =>
			((customer?.customer_products ?? []) as CusProduct[]).some(
				(cp) =>
					(ACTIVE_STATUSES.includes(cp.status) ||
						cp.status === CusProductStatus.Trialing) &&
					cp.subscription_ids &&
					cp.subscription_ids.length > 0,
			),
		[customer?.customer_products],
	);

	const hasPaidRecurringSubscription = useMemo(
		() =>
			((customer?.customer_products ?? []) as CusProduct[]).some(
				(customerProduct) => {
					const hasActiveOrTrialingStatus =
						ACTIVE_STATUSES.includes(customerProduct.status) ||
						customerProduct.status === CusProductStatus.Trialing;

					if (!hasActiveOrTrialingStatus) return false;
					if (!customerProduct.subscription_ids?.length) return false;

					const prices = cusProductToPrices({ cusProduct: customerProduct });
					return !isOneOffProduct({ prices }) && !isFreeProduct({ prices });
				},
			),
		[customer?.customer_products],
	);

	const hasOutgoing = (previewData?.outgoing.length ?? 0) > 0;
	const incomingPlan = previewData?.incoming[0]?.plan;
	const outgoingPlan = previewData?.outgoing[0]?.plan;

	const isPaidRecurringAttach =
		(incomingPlan?.price?.amount ?? 0) > 0 &&
		incomingPlan?.price?.interval !== BillingInterval.OneOff;

	const isOutgoingPaidRecurring =
		(outgoingPlan?.price?.amount ?? 0) > 0 &&
		outgoingPlan?.price?.interval !== BillingInterval.OneOff;

	const isDirectPaidTransition =
		hasOutgoing && isPaidRecurringAttach && isOutgoingPaidRecurring;
	const isFreeToPaidTransition =
		hasOutgoing && isPaidRecurringAttach && !isOutgoingPaidRecurring;

	const canChooseBillingCycle =
		isPaidRecurringAttach &&
		hasPaidRecurringSubscription &&
		!isDirectPaidTransition;

	const defaultPlanSchedule = useMemo((): PlanTiming => {
		if (!previewData || !hasOutgoing) return "immediate";

		const incomingPrice = previewData.incoming[0]?.plan.price?.amount ?? 0;
		const outgoingPrice = previewData.outgoing[0]?.plan.price?.amount ?? 0;
		const isUpgrade = incomingPrice > outgoingPrice;

		return isUpgrade ? "immediate" : "end_of_cycle";
	}, [previewData, hasOutgoing]);

	const effectivePlanSchedule = !hasOutgoing
		? "immediate"
		: (planSchedule ?? defaultPlanSchedule);

	const showBillingBehavior =
		hasActiveSubscription && effectivePlanSchedule === "immediate";
	const isNoChargesAllowed = isNoChargesAllowedForAttach({
		newBillingSubscription,
		blocksNextCycleOnly: isFreeToPaidTransition,
	});
	const normalizedBillingBehavior = normalizeAttachBillingBehavior({
		billingBehavior,
		newBillingSubscription,
		blocksNextCycleOnly: isFreeToPaidTransition,
	});
	const effectiveBillingBehavior =
		normalizedBillingBehavior ?? "prorate_immediately";
	const noChargesDisabledReason = getNoChargesDisabledReason({
		newBillingSubscription,
		blocksNextCycleOnly: isFreeToPaidTransition,
	});

	const hasCustomSchedule =
		planSchedule !== null && planSchedule !== defaultPlanSchedule;
	const hasCustomBilling =
		showBillingBehavior &&
		normalizedBillingBehavior !== null &&
		normalizedBillingBehavior !== "prorate_immediately";

	const isImmediateSelected = effectivePlanSchedule === "immediate";
	const isEndOfCycleSelected = effectivePlanSchedule === "end_of_cycle";

	useEffect(() => {
		if (canChooseBillingCycle) return;
		if (!newBillingSubscription) return;
		form.setFieldValue("newBillingSubscription", false);
	}, [canChooseBillingCycle, form, newBillingSubscription]);

	useEffect(() => {
		if (billingBehavior !== "next_cycle_only") return;
		if (isNoChargesAllowed) return;
		form.setFieldValue("billingBehavior", null);
	}, [billingBehavior, form, isNoChargesAllowed]);

	const handleScheduleChange = (value: PlanTiming) => {
		form.setFieldValue("planSchedule", value);
		// Reset billing behavior when switching away from immediate
		if (value !== "immediate") {
			form.setFieldValue("billingBehavior", null);
		}
	};

	const handleBillingCycleChange = ({
		createNewCycle,
	}: {
		createNewCycle: boolean;
	}) => {
		form.setFieldValue("newBillingSubscription", createNewCycle);
		form.setFieldValue(
			"billingBehavior",
			normalizeAttachBillingBehavior({
				billingBehavior,
				newBillingSubscription: createNewCycle,
				blocksNextCycleOnly: isFreeToPaidTransition,
			}),
		);
	};

	const handleBillingBehaviorChange = (value: BillingBehavior) => {
		form.setFieldValue(
			"billingBehavior",
			normalizeAttachBillingBehavior({
				billingBehavior: value,
				newBillingSubscription,
				blocksNextCycleOnly: isFreeToPaidTransition,
			}),
		);
	};

	return {
		hasActiveSubscription,
		hasOutgoing,
		hasPaidRecurringSubscription,
		canChooseBillingCycle,
		defaultPlanSchedule,
		effectivePlanSchedule,
		showBillingBehavior,
		effectiveBillingBehavior,
		hasCustomSchedule,
		hasCustomBilling,
		isImmediateSelected,
		isEndOfCycleSelected,
		isNoChargesAllowed,
		noChargesDisabledReason,
		handleScheduleChange,
		handleBillingCycleChange,
		handleBillingBehaviorChange,
	};
}
