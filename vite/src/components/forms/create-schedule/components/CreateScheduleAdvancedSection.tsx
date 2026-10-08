import {
	type BillingBehavior,
	featureUtils,
	isBooleanFeature,
} from "@autumn/shared";
import { Switch } from "@autumn/ui";
import { BillingCycleAnchorConfigRow } from "@/components/forms/shared/BillingCycleAnchorConfigRow";
import { BillingOptionSections } from "@/components/forms/shared/billing-option-sections/BillingOptionSections";
import {
	anchorSummary,
	carryOverSummary,
	dateSummary,
	editedTrialSummary,
	prorationSummary,
	renewsSummary,
	staysAs,
	switchSummary,
} from "@/components/forms/shared/billing-option-sections/utils/billingOptionSummaries";
import { CarryOverConfigRow } from "@/components/forms/shared/CarryOverConfigRow";
import { ConfigRow } from "@/components/forms/shared/ConfigRow";
import { EndDateConfigRow } from "@/components/forms/shared/EndDateConfigRow";
import { ProrationBehaviorConfigRow } from "@/components/forms/shared/ProrationBehaviorConfigRow";
import { getBillingOptionRules } from "@/components/forms/shared/utils/billingOptionRules";
import { useCreateScheduleFormContext } from "../context/CreateScheduleFormProvider";
import { firstPhaseStartText } from "../utils/firstPhaseStartText";
import { hasPaidRecurringSchedulePlan } from "../utils/hasPaidRecurringSchedulePlan";
import { scheduleBillingCycleAnchorBounds } from "../utils/scheduleBillingCycleAnchorBounds";
import { firstPhaseStartsLater } from "../utils/schedulePhaseTiming";
import { ScheduleFreeTrialRow } from "./ScheduleFreeTrialRow";

const BACKDATE_PRORATION_LABELS: Partial<Record<BillingBehavior, string>> = {
	none: "Backdated time not billed",
	prorate_immediately: "Bills backdated time",
};

export function CreateScheduleAdvancedSection() {
	const {
		form,
		formValues,
		products,
		features,
		nowMs,
		backdatesLiveSubscription,
		backdateKeepsRenewalDate,
		hasActiveSubscription,
		carriesUsageNow,
		prorationDefaultsToNone,
		canScheduleTrial,
		isExistingSchedule,
		previewQuery,
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
			carriesUsageNow,
		},
	});
	const resetRule = backdateKeepsRenewalDate
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
	const defaultProration: BillingBehavior = prorationDefaultsToNone
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
						summary: prorationSummary({
							value: proration,
							defaultValue: defaultProration,
							labels: backdatesLiveSubscription
								? BACKDATE_PRORATION_LABELS
								: undefined,
						}),
						row: (
							<ProrationBehaviorConfigRow
								rule={rules.proration}
								billsBackdatedGap={backdatesLiveSubscription}
								value={proration}
								onChange={(value) =>
									form.setFieldValue(
										"phases[0].prorationBehavior",
										value === "prorate_immediately" && !prorationDefaultsToNone
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
						id: "firstPhaseStart",
						visible: true,
						summary: staysAs(
							firstPhaseStartText({ phases, nowMs, isExistingSchedule }),
						),
					},
					{
						id: "earlyAccess",
						visible: firstPhaseStartsLater({ phases, nowMs }),
						summary: switchSummary({
							enabled: enablePlanImmediately,
							changedText: "Early access",
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
						summary: anchorSummary({
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
						summary: dateSummary({ label: "Ends", date: endDate }),
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
						summary: editedTrialSummary({
							edited: formValues.trialEdited,
							enabled: formValues.trialEnabled,
							length: formValues.trialLength,
							duration: formValues.trialDuration,
						}),
						row: <ScheduleFreeTrialRow />,
					},
					{
						id: "renews",
						visible: !firstPhaseStartsLater({ phases, nowMs }),
						summary: renewsSummary({
							startsAt: previewQuery.data?.next_cycle?.starts_at,
						}),
					},
				],
				balances: [
					{
						id: "usageResets",
						visible: !carryOverUsages,
						summary: staysAs("Usage resets"),
					},
					{
						id: "carryOverUsages",
						visible: rules.carryOverUsages.visible,
						summary: carryOverSummary({
							enabled: carryOverUsages,
							featureIds: carryOverUsageFeatureIds,
							noun: "usage",
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
