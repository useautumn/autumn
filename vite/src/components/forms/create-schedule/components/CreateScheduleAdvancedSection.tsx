import type { ReactNode } from "react";
import {
	AdvancedSection,
	ConfigRow,
} from "@/components/forms/shared/advanced-section";
import { Switch } from "@/components/ui/switch";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/v2/tooltips/Tooltip";
import { useCreateScheduleFormContext } from "../context/CreateScheduleFormProvider";

export function CreateScheduleAdvancedSection() {
	const { form, formValues, preview } = useCreateScheduleFormContext();
	const { billingBehavior, resetBillingCycle, enablePlanImmediately, phases } =
		formValues;
	const isCheckoutRedirect = preview?.redirect_to_checkout === true;

	const isProrate = billingBehavior !== "none";
	const hasMultipleImmediatePlans = (phases[0]?.plans.length ?? 0) > 1;
	const disabledReason = hasMultipleImmediatePlans
		? "Not yet supported for multi attach"
		: null;

	const renderToggle = ({
		checked,
		onCheckedChange,
	}: {
		checked: boolean;
		onCheckedChange: (checked: boolean) => void;
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
				})}
			/>
			<ConfigRow
				title="Reset Billing Cycle"
				description="Restart the billing cycle from today"
				action={renderToggle({
					checked: resetBillingCycle,
					onCheckedChange: (checked) =>
						form.setFieldValue("resetBillingCycle", !!checked),
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
