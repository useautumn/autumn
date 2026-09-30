import { isFreeProductV2, isOneOffProductV2 } from "@autumn/shared";
import {
	canResetScheduleBillingCycle,
	hasMultipleImmediateSchedulePlans,
} from "@/components/forms/customer-state/customerStateSchema";
import { AdvancedSection } from "@/components/forms/shared/advanced-section";
import { BillingCycleAnchorConfigRow } from "@/components/forms/shared/BillingCycleAnchorConfigRow";
import { EndDateConfigRow } from "@/components/forms/shared/EndDateConfigRow";
import { ProrationBehaviorConfigRow } from "@/components/forms/shared/ProrationBehaviorConfigRow";
import { getBillingOptionRules } from "@/components/forms/shared/utils/billingOptionRules";
import { useCreateScheduleFormContext } from "../context/CreateScheduleFormProvider";

export function CreateScheduleAdvancedSection() {
	const { form, formValues, products, nowMs } = useCreateScheduleFormContext();
	const {
		billingBehavior,
		resetBillingCycle,
		billingCycleAnchorMode,
		billingCycleAnchorDate,
		endDate,
		phases,
	} = formValues;

	const hasPaidRecurringPlan = phases.some((phase) =>
		phase.plans.some((plan) => {
			const product = products.find(({ id }) => id === plan.productId);
			return (
				!!product &&
				!isFreeProductV2({ items: product.items }) &&
				!isOneOffProductV2({ items: product.items })
			);
		}),
	);

	const rules = getBillingOptionRules({
		flow: "schedule",
		state: {
			hasMultipleImmediatePlans: hasMultipleImmediateSchedulePlans({ phases }),
			canResetScheduleBillingCycle: canResetScheduleBillingCycle({ phases }),
			hasPaidRecurringPlan,
		},
	});
	const lastPhaseStartsAt = phases[phases.length - 1]?.startsAt ?? 0;
	const endDateMin = Math.max(nowMs, lastPhaseStartsAt);

	return (
		<AdvancedSection>
			{rules.proration.visible && (
				<ProrationBehaviorConfigRow
					rule={rules.proration}
					value={billingBehavior ?? "prorate_immediately"}
					onChange={(value) =>
						form.setFieldValue(
							"billingBehavior",
							value === "prorate_immediately" ? null : value,
						)
					}
				/>
			)}
			{rules.resetBillingCycle.visible && (
				<BillingCycleAnchorConfigRow
					rule={rules.resetBillingCycle}
					enabled={resetBillingCycle}
					mode={billingCycleAnchorMode}
					customAnchor={billingCycleAnchorDate}
					maxUnixDate={endDate ? endDate - 1_000 : undefined}
					onEnabledChange={(enabled) =>
						form.setFieldValue("resetBillingCycle", enabled)
					}
					onModeChange={(mode) =>
						form.setFieldValue("billingCycleAnchorMode", mode)
					}
					onCustomAnchorChange={(anchor) =>
						form.setFieldValue("billingCycleAnchorDate", anchor)
					}
				/>
			)}
			{rules.endDate.visible && (
				<EndDateConfigRow
					endDate={endDate}
					minUnixDate={endDateMin}
					onEndDateChange={(value) => form.setFieldValue("endDate", value)}
				/>
			)}
		</AdvancedSection>
	);
}
