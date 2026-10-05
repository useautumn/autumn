import { Switch } from "@autumn/ui";
import { AdvancedSection } from "@/components/forms/shared/advanced-section";
import { BillingOptionToggle } from "@/components/forms/shared/BillingOptionToggle";
import { ConfigRow } from "@/components/forms/shared/ConfigRow";
import { EndDateConfigRow } from "@/components/forms/shared/EndDateConfigRow";
import { ProrationBehaviorConfigRow } from "@/components/forms/shared/ProrationBehaviorConfigRow";
import { getBillingOptionRules } from "@/components/forms/shared/utils/billingOptionRules";
import { useCreateScheduleFormContext } from "../context/CreateScheduleFormProvider";
import { hasPaidRecurringSchedulePlan } from "../utils/hasPaidRecurringSchedulePlan";
import { firstPhaseStartsLater } from "../utils/schedulePhaseTiming";

export function CreateScheduleAdvancedSection() {
	const { form, formValues, products, nowMs, backdatesLiveSubscription } =
		useCreateScheduleFormContext();
	const { resetBillingCycle, endDate, phases, enablePlanImmediately } =
		formValues;

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
				<ConfigRow
					title="Reset Billing Cycle"
					description="Restart the billing cycle when the first phase starts"
					action={
						<BillingOptionToggle
							rule={resetRule}
							checked={resetBillingCycle && !backdatesLiveSubscription}
							onCheckedChange={(checked) =>
								form.setFieldValue("resetBillingCycle", checked)
							}
						/>
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
