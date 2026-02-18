import {
	ACTIVE_STATUSES,
	type BillingBehavior,
	type CusProduct,
	CusProductStatus,
	type PlanTiming,
} from "@autumn/shared";
import { useMemo } from "react";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { useAttachFormContext } from "../context/AttachFormProvider";

/** Encapsulates planSchedule + billingBehavior derived state and mutations. */
export function usePlanScheduleField() {
	const { form, formValues, previewQuery } = useAttachFormContext();
	const { planSchedule, billingBehavior } = formValues;
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

	const hasOutgoing = (previewData?.outgoing.length ?? 0) > 0;

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
	const effectiveBillingBehavior = billingBehavior ?? "prorate_immediately";

	const hasCustomSchedule =
		planSchedule !== null && planSchedule !== defaultPlanSchedule;
	const hasCustomBilling =
		showBillingBehavior &&
		billingBehavior !== null &&
		billingBehavior !== "prorate_immediately";

	const isImmediateSelected = effectivePlanSchedule === "immediate";
	const isEndOfCycleSelected = effectivePlanSchedule === "end_of_cycle";

	const handleScheduleChange = (value: PlanTiming) => {
		form.setFieldValue("planSchedule", value);
		// Reset billing behavior when switching away from immediate
		if (value !== "immediate") {
			form.setFieldValue("billingBehavior", null);
		}
	};

	const handleBillingBehaviorChange = (value: BillingBehavior) => {
		form.setFieldValue("billingBehavior", value);
	};

	return {
		hasActiveSubscription,
		hasOutgoing,
		defaultPlanSchedule,
		effectivePlanSchedule,
		showBillingBehavior,
		effectiveBillingBehavior,
		hasCustomSchedule,
		hasCustomBilling,
		isImmediateSelected,
		isEndOfCycleSelected,
		handleScheduleChange,
		handleBillingBehaviorChange,
	};
}
