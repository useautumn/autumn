import { Switch } from "@autumn/ui";
import {
	canResetScheduleBillingCycle,
	hasMultipleImmediateSchedulePlans,
	hasPersistedCreateSchedule,
} from "@/components/forms/customer-state/customerStateSchema";
import { AdvancedSection } from "@/components/forms/shared/advanced-section";
import { BillingCycleAnchorConfigRow } from "@/components/forms/shared/BillingCycleAnchorConfigRow";
import { ConfigRow } from "@/components/forms/shared/ConfigRow";
import { EndDateConfigRow } from "@/components/forms/shared/EndDateConfigRow";
import { ProrationBehaviorConfigRow } from "@/components/forms/shared/ProrationBehaviorConfigRow";
import { getBillingOptionRules } from "@/components/forms/shared/utils/billingOptionRules";
import { useCreateScheduleFormContext } from "../context/CreateScheduleFormProvider";
import { hasPaidRecurringSchedulePlan } from "../utils/hasPaidRecurringSchedulePlan";
import { firstPhaseStartsLater } from "../utils/schedulePhaseTiming";

export function CreateScheduleAdvancedSection() {
	const { form, formValues, products, nowMs } = useCreateScheduleFormContext();
	const {
		billingBehavior,
		resetBillingCycle,
		billingCycleAnchorMode,
		billingCycleAnchorDate,
		endDate,
		phases,
		enablePlanImmediately,
	} = formValues;

	const hasPaidRecurringPlan = hasPaidRecurringSchedulePlan({
		phases,
		products,
	});

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
			{firstPhaseStartsLater({ phases, nowMs }) && (
				<ConfigRow
					title="Early Access"
					description="Give access now, and start billing when the first phase starts"
					action={
						<Switch
							aria-label="Early Access"
							checked={enablePlanImmediately}
							onCheckedChange={(checked) =>
								form.setFieldValue("enablePlanImmediately", checked)
							}
						/>
					}
				/>
			)}
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
					allowCustomAnchor={!hasPersistedCreateSchedule({ phases })}
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
