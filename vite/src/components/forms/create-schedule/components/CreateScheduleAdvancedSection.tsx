import { featureUtils, isBooleanFeature } from "@autumn/shared";
import { Switch } from "@autumn/ui";
import { AdvancedSection } from "@/components/forms/shared/advanced-section";
import { BillingCycleAnchorConfigRow } from "@/components/forms/shared/BillingCycleAnchorConfigRow";
import { CarryOverConfigRow } from "@/components/forms/shared/CarryOverConfigRow";
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
		features,
		nowMs,
		backdatesLiveSubscription,
		hasActiveSubscription,
		replacesPlanNow,
		canScheduleTrial,
	} = useCreateScheduleFormContext();
	const {
		resetBillingCycle,
		billingCycleAnchorMode,
		billingCycleAnchorDate,
		endDate,
		phases,
		enablePlanImmediately,
		carryOverUsages,
		carryOverUsageFeatureIds,
	} = formValues;

	const rules = getBillingOptionRules({
		flow: "schedule",
		state: {
			hasPaidRecurringPlan: hasPaidRecurringSchedulePlan({ phases, products }),
			replacesPlanNow,
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
			{rules.carryOverUsages.visible && (
				<CarryOverConfigRow
					title="Carry Over Usages"
					description="Preserve existing usage counts when switching plans"
					features={features.filter(
						(feature) =>
							!isBooleanFeature({ feature }) &&
							!featureUtils.isAllocated(feature),
					)}
					value={{
						enabled: carryOverUsages,
						featureIds: carryOverUsageFeatureIds,
					}}
					onChange={({ enabled, featureIds }) => {
						form.setFieldValue("carryOverUsages", enabled);
						form.setFieldValue("carryOverUsageFeatureIds", featureIds);
					}}
				/>
			)}
			{canScheduleTrial && <ScheduleFreeTrialRow />}
		</AdvancedSection>
	);
}
