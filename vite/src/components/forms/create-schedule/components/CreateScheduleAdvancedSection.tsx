import {
	canResetScheduleBillingCycle,
	hasMultipleImmediateSchedulePlans,
} from "@/components/forms/customer-state/customerStateSchema";
import {
	AdvancedSection,
	ConfigRow,
} from "@/components/forms/shared/advanced-section";
import { BillingOptionToggle } from "@/components/forms/shared/BillingOptionToggle";
import { ProrationBehaviorConfigRow } from "@/components/forms/shared/ProrationBehaviorConfigRow";
import { getBillingOptionRules } from "@/components/forms/shared/utils/billingOptionRules";
import { useCreateScheduleFormContext } from "../context/CreateScheduleFormProvider";

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
