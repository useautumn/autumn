import { Switch, Tooltip, TooltipContent, TooltipTrigger } from "@autumn/ui";
import { type ReactNode, useEffect } from "react";
import {
	AdvancedSection,
	ConfigRow,
} from "@/components/forms/shared/advanced-section";
import {
	canResetScheduleBillingCycle,
	hasMultipleImmediateSchedulePlans,
} from "../createScheduleFormSchema";
import { useCreateScheduleFormContext } from "../context/CreateScheduleFormProvider";

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

	const isProrate = billingBehavior !== "none";
	const hasMultipleImmediatePlans = hasMultipleImmediateSchedulePlans({ phases });
	const prorateDisabledReason = hasMultipleImmediatePlans
		? "Not yet supported for multi attach"
		: null;
	const resetDisabledReason =
		hasMultipleImmediatePlans && !canResetScheduleBillingCycle({ phases })
			? "Not yet supported for multi attach"
			: null;

	const renderToggle = ({
		checked,
		onCheckedChange,
		disabledReason,
	}: {
		checked: boolean;
		onCheckedChange: (checked: boolean) => void;
		disabledReason: string | null;
	}): ReactNode => (
		<Tooltip>
			<TooltipTrigger asChild>
				<span className="inline-flex">
					<Switch
						checked={checked}
						disabled={!!disabledReason}
						onCheckedChange={onCheckedChange}
					/>
				</span>
			</TooltipTrigger>
			{disabledReason && <TooltipContent>{disabledReason}</TooltipContent>}
		</Tooltip>
	);

	return (
		<AdvancedSection>
			<ConfigRow
				title="Prorate Changes"
				description="Prorate price differences when changing plans mid-cycle"
				action={renderToggle({
					checked: isProrate,
					onCheckedChange: (checked) =>
						form.setFieldValue("billingBehavior", checked ? null : "none"),
					disabledReason: prorateDisabledReason,
				})}
			/>
			<ConfigRow
				title="Reset Billing Cycle"
				description="Align Stripe anchors to avoid off-cycle charges"
				action={renderToggle({
					checked: resetBillingCycle,
					onCheckedChange: (checked) =>
						form.setFieldValue("resetBillingCycle", !!checked),
					disabledReason: resetDisabledReason,
				})}
			/>
			{isCheckoutRedirect && (
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
