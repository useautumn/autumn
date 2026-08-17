import {
	AdvancedSection,
	ConfigRow,
} from "@/components/forms/shared/advanced-section";
import { BillingOptionToggle } from "@/components/forms/shared/BillingOptionToggle";
import { getBillingOptionRules } from "@/components/forms/shared/utils/billingOptionRules";
import { useCreateScheduleFormContext } from "../context/CreateScheduleFormProvider";
import {
	canResetScheduleBillingCycle,
	hasMultipleImmediateSchedulePlans,
} from "../createScheduleFormSchema";

export function CreateScheduleAdvancedSection() {
	const { form, formValues } = useCreateScheduleFormContext();
	const { billingBehavior, resetBillingCycle, phases } = formValues;

	const rules = getBillingOptionRules({
		flow: "schedule",
		state: {
			hasMultipleImmediatePlans: hasMultipleImmediateSchedulePlans({ phases }),
			canResetScheduleBillingCycle: canResetScheduleBillingCycle({ phases }),
		},
	});

	return (
		<AdvancedSection>
			{rules.proration.visible && (
				<ConfigRow
					title="Prorate Changes"
					description="Prorate price differences when changing plans mid-cycle"
					action={
						<BillingOptionToggle
							rule={rules.proration}
							checked={billingBehavior !== "none"}
							onCheckedChange={(checked) =>
								form.setFieldValue("billingBehavior", checked ? null : "none")
							}
						/>
					}
				/>
			)}
			{rules.resetBillingCycle.visible && (
				<ConfigRow
					title="Reset Billing Cycle"
					description="Align Stripe anchors to avoid off-cycle charges"
					action={
						<BillingOptionToggle
							rule={rules.resetBillingCycle}
							checked={resetBillingCycle}
							onCheckedChange={(checked) =>
								form.setFieldValue("resetBillingCycle", !!checked)
							}
						/>
					}
				/>
			)}
		</AdvancedSection>
	);
}
