import {
	type BillingBehavior,
	featureUtils,
	isBooleanFeature,
} from "@autumn/shared";
import { Switch } from "@autumn/ui";
import { BillingCycleAnchorConfigRow } from "@/components/forms/shared/BillingCycleAnchorConfigRow";
import { BillingOptionSections } from "@/components/forms/shared/billing-option-sections/BillingOptionSections";
import {
	billingCycleAnchorChange,
	datedChange,
	freeTrialChange,
	prorationChange,
	toggledChange,
} from "@/components/forms/shared/billing-option-sections/utils/billingOptionChanges";
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
	const anchorMode = anchorBounds.allowCustomAnchor
		? billingCycleAnchorMode
		: "now";
	const defaultProration: BillingBehavior = backdatesLiveSubscription
		? "none"
		: "prorate_immediately";
	const proration = phases[0]?.prorationBehavior ?? defaultProration;

	return (
		<BillingOptionSections
			sections={{
				charges: [
					{
						id: "proration",
						visible: rules.proration.visible,
						locked: rules.proration.disabled,
						change: prorationChange({
							value: proration,
							defaultValue: defaultProration,
						}),
						row: (
							<ProrationBehaviorConfigRow
								rule={rules.proration}
								billsBackdatedGap={backdatesLiveSubscription}
								value={proration}
								onChange={(value) =>
									form.setFieldValue(
										"phases[0].prorationBehavior",
										value === "prorate_immediately" &&
											!backdatesLiveSubscription
											? null
											: value,
									)
								}
							/>
						),
					},
				],
				timing: [
					{
						id: "earlyAccess",
						visible: firstPhaseStartsLater({ phases, nowMs }),
						change: toggledChange({
							enabled: enablePlanImmediately,
							label: "early access",
						}),
						row: (
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
						),
					},
					{
						id: "resetBillingCycle",
						visible: resetRule.visible,
						locked: resetRule.disabled,
						change: billingCycleAnchorChange({
							enabled: resetBillingCycle,
							mode: anchorMode,
							customAnchor: billingCycleAnchorDate,
						}),
						row: (
							<BillingCycleAnchorConfigRow
								rule={resetRule}
								enabled={resetBillingCycle && !backdatesLiveSubscription}
								mode={anchorMode}
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
						),
					},
					{
						id: "endDate",
						visible: rules.endDate.visible,
						change: datedChange({ label: "end", date: endDate }),
						row: (
							<EndDateConfigRow
								endDate={endDate}
								minUnixDate={endDateMin}
								onEndDateChange={(value) =>
									form.setFieldValue("endDate", value)
								}
							/>
						),
					},
					{
						id: "freeTrial",
						visible: canScheduleTrial,
						change: freeTrialChange({
							edited: formValues.trialEdited,
							enabled: formValues.trialEnabled,
							length: formValues.trialLength,
							duration: formValues.trialDuration,
						}),
						row: <ScheduleFreeTrialRow />,
					},
				],
				balances: [
					{
						id: "carryOverUsages",
						visible: rules.carryOverUsages.visible,
						change: toggledChange({
							enabled: carryOverUsages,
							label: "carry over usages",
						}),
						row: (
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
						),
					},
				],
			}}
		/>
	);
}
