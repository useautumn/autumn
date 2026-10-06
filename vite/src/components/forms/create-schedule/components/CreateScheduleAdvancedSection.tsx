import { Switch } from "@autumn/ui";
import { AdvancedSection } from "@/components/forms/shared/advanced-section";
import { BillingCycleAnchorConfigRow } from "@/components/forms/shared/BillingCycleAnchorConfigRow";
import { ConfigRow } from "@/components/forms/shared/ConfigRow";
import { EndDateConfigRow } from "@/components/forms/shared/EndDateConfigRow";
import { ProrationBehaviorConfigRow } from "@/components/forms/shared/ProrationBehaviorConfigRow";
import { getBillingOptionRules } from "@/components/forms/shared/utils/billingOptionRules";
import { useCreateScheduleFormContext } from "../context/CreateScheduleFormProvider";
import { hasPaidRecurringSchedulePlan } from "../utils/hasPaidRecurringSchedulePlan";
import { scheduleBillingCycleAnchorBounds } from "../utils/scheduleBillingCycleAnchorBounds";
import { firstPhaseStartsLater } from "../utils/schedulePhaseTiming";
import { ScheduleFreeTrialRow } from "./ScheduleFreeTrialRow";

export function CreateScheduleAdvancedSection() {
	const {
		form,
		formValues,
		products,
		nowMs,
		backdatesLiveSubscription,
		hasActiveSubscription,
		canScheduleTrial,
	} = useCreateScheduleFormContext();
	const {
		resetBillingCycle,
		billingCycleAnchorMode,
		billingCycleAnchorDate,
		endDate,
		phases,
		enablePlanImmediately,
	} = formValues;

	const rules = getBillingOptionRules({
		flow: "schedule",
		state: {
			hasPaidRecurringPlan: hasPaidRecurringSchedulePlan({ phases, products }),
		},
	});
	const resetRule = backdatesLiveSubscription
		? {
				...rules.resetBillingCycle,
				disabled: true,
				disabledReason:
					"A backdated subscription keeps its current renewal date",
			}
		: rules.resetBillingCycle;
	const lastPhaseStartsAt = phases[phases.length - 1]?.startsAt ?? 0;
	const endDateMin = Math.max(nowMs, lastPhaseStartsAt);
	const anchorBounds = scheduleBillingCycleAnchorBounds({
		phases,
		endDate,
		nowMs,
		hasActiveSubscription,
	});

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
					billsBackdatedGap={backdatesLiveSubscription}
					value={
						phases[0]?.prorationBehavior ??
						(backdatesLiveSubscription ? "none" : "prorate_immediately")
					}
					onChange={(value) =>
						form.setFieldValue(
							"phases[0].prorationBehavior",
							value === "prorate_immediately" && !backdatesLiveSubscription
								? null
								: value,
						)
					}
				/>
			)}
			{rules.resetBillingCycle.visible && (
				<BillingCycleAnchorConfigRow
					rule={resetRule}
					enabled={resetBillingCycle && !backdatesLiveSubscription}
					mode={anchorBounds.allowCustomAnchor ? billingCycleAnchorMode : "now"}
					customAnchor={billingCycleAnchorDate}
					allowCustomAnchor={anchorBounds.allowCustomAnchor}
					minUnixDate={anchorBounds.minUnixDate}
					maxUnixDate={anchorBounds.maxUnixDate}
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
			{canScheduleTrial && <ScheduleFreeTrialRow />}
		</AdvancedSection>
	);
}
