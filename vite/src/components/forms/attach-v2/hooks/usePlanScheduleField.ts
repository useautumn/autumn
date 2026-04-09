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
	normalizeAttachProrationBehavior,
} from "../utils/attachProrationBehaviorRules";

/** Encapsulates planSchedule + prorationBehavior derived state and mutations. */
export function usePlanScheduleField() {
	const { form, formValues, previewQuery } = useAttachFormContext();
	const { planSchedule, prorationBehavior, newBillingSubscription } =
		formValues;
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

	const hasActiveProductWithTrial = useMemo(
		() =>
			((customer?.customer_products ?? []) as CusProduct[]).some(
				(cp) =>
					(ACTIVE_STATUSES.includes(cp.status) ||
						cp.status === CusProductStatus.Trialing) &&
					cp.subscription_ids &&
					cp.subscription_ids.length > 0 &&
					!!cp.free_trial_id,
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

	const showProrationRow =
		hasActiveSubscription && !hasActiveProductWithTrial;
	const showProrationBehavior =
		showProrationRow && effectivePlanSchedule === "immediate";
	const isNoChargesAllowed = isNoChargesAllowedForAttach({
		newBillingSubscription,
		blocksNextCycleOnly: isFreeToPaidTransition,
	});
	const normalizedProrationBehavior = normalizeAttachProrationBehavior({
		prorationBehavior,
		newBillingSubscription,
		blocksNextCycleOnly: isFreeToPaidTransition,
	});
	const effectiveProrationBehavior =
		normalizedProrationBehavior ??
		(isNoChargesAllowed ? "none" : "prorate_immediately");
	const noChargesDisabledReason = getNoChargesDisabledReason({
		newBillingSubscription,
		blocksNextCycleOnly: isFreeToPaidTransition,
	});

	const hasCustomSchedule =
		planSchedule !== null && planSchedule !== defaultPlanSchedule;
	const hasCustomProration =
		showProrationBehavior &&
		normalizedProrationBehavior !== null &&
		normalizedProrationBehavior !== "none";

	const isImmediateSelected = effectivePlanSchedule === "immediate";
	const isEndOfCycleSelected = effectivePlanSchedule === "end_of_cycle";

	useEffect(() => {
		if (canChooseBillingCycle) return;
		if (!newBillingSubscription) return;
		form.setFieldValue("newBillingSubscription", false);
	}, [canChooseBillingCycle, form, newBillingSubscription]);

	useEffect(() => {
		if (showProrationBehavior) return;
		if (prorationBehavior === null) return;
		form.setFieldValue("prorationBehavior", null);
	}, [showProrationBehavior, prorationBehavior, form]);

	useEffect(() => {
		if (!showProrationBehavior) return;
		if (prorationBehavior !== null) return;
		if (!isNoChargesAllowed) return;
		form.setFieldValue("prorationBehavior", "none");
	}, [showProrationBehavior, prorationBehavior, isNoChargesAllowed, form]);

	useEffect(() => {
		if (prorationBehavior !== "none") return;
		if (isNoChargesAllowed) return;
		form.setFieldValue("prorationBehavior", null);
	}, [prorationBehavior, form, isNoChargesAllowed]);

	const handleScheduleChange = (value: PlanTiming) => {
		form.setFieldValue("planSchedule", value);
		if (value !== "immediate") {
			form.setFieldValue("prorationBehavior", null);
		}
	};

	const handleBillingCycleChange = ({
		createNewCycle,
	}: {
		createNewCycle: boolean;
	}) => {
		form.setFieldValue("newBillingSubscription", createNewCycle);
		form.setFieldValue(
			"prorationBehavior",
			normalizeAttachProrationBehavior({
				prorationBehavior,
				newBillingSubscription: createNewCycle,
				blocksNextCycleOnly: isFreeToPaidTransition,
			}),
		);
	};

	const handleProrationBehaviorChange = (value: BillingBehavior) => {
		form.setFieldValue(
			"prorationBehavior",
			normalizeAttachProrationBehavior({
				prorationBehavior: value,
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
