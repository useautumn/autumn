import { Switch } from "@autumn/ui";
import { useEffect } from "react";
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
	const { form, formValues, preview } = useCreateScheduleFormContext();
	const { billingBehavior, resetBillingCycle, enablePlanImmediately, phases } =
		formValues;
	const isCheckoutRedirect = preview?.redirect_to_checkout === true;

	// Keep form state in sync with what the user can see: when the toggle hides
	// (no checkout flow), reset the value so a stale `true` doesn't leak into
	// the request body.
	useEffect(() => {
		if (!isCheckoutRedirect && enablePlanImmediately) {
			form.setFieldValue("enablePlanImmediately", false);
		}
	}, [isCheckoutRedirect, enablePlanImmediately, form]);

	const rules = getBillingOptionRules({
		flow: "schedule",
		state: {
			hasMultipleImmediatePlans: hasMultipleImmediateSchedulePlans({ phases }),
			canResetScheduleBillingCycle: canResetScheduleBillingCycle({ phases }),
			isCheckoutRedirect,
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
			{rules.enablePlanImmediately.visible && (
				<ConfigRow
					title="Enable Plan Immediately"
					description="Activate the plan as soon as the checkout URL is generated, before the customer pays."
					action={
						<Switch
							checked={enablePlanImmediately}
							onCheckedChange={(checked) =>
								form.setFieldValue("enablePlanImmediately", !!checked)
							}
						/>
					}
				/>
			)}
		</AdvancedSection>
	);
}
