import {
	cusProductToPrices,
	isFreeProduct,
	isOneOffProduct,
} from "@autumn/shared";
import {
	ArrowCounterClockwiseIcon,
	CalendarIcon,
	LightningIcon,
} from "@phosphor-icons/react";
import { useMemo } from "react";
import {
	AdvancedSection,
	AdvancedToggleRow,
} from "@/components/forms/shared/advanced-section";
import { IconCheckbox } from "@/components/v2/checkboxes/IconCheckbox";
import { cn } from "@/lib/utils";
import { useUpdateSubscriptionFormContext } from "../context/UpdateSubscriptionFormProvider";

export function UpdateSubscriptionAdvancedSection() {
	const { form, formValues, formContext } = useUpdateSubscriptionFormContext();
	const { billingBehavior, resetBillingCycle } = formValues;

	const isProrate = billingBehavior !== "none";
	const isNextCycleOnly = billingBehavior === "none";

	const isPaidRecurring = useMemo(() => {
		const prices = cusProductToPrices({
			cusProduct: formContext.customerProduct,
		});
		return !isFreeProduct({ prices }) && !isOneOffProduct({ prices });
	}, [formContext.customerProduct]);

	const showResetBillingCycle = isPaidRecurring;

	const hasCustomSettings = isNextCycleOnly || resetBillingCycle;
	const getCustomSettingsTooltip = (): string => {
		const parts: string[] = [];
		if (isNextCycleOnly) parts.push("Proration: Next Cycle Only");
		if (resetBillingCycle) parts.push("Reset Billing Cycle");
		return parts.join(" \u2022 ");
	};

	return (
		<AdvancedSection
			hasCustomSettings={hasCustomSettings}
			customSettingsTooltip={getCustomSettingsTooltip()}
		>
			<AdvancedToggleRow label="Proration Behaviour">
				<IconCheckbox
					icon={<LightningIcon />}
					iconOrientation="left"
					variant="secondary"
					size="sm"
					checked={isProrate}
					onCheckedChange={() => form.setFieldValue("billingBehavior", null)}
					className={cn("rounded-r-none", !isProrate && "border-r-0")}
				>
					Prorate
				</IconCheckbox>
				<IconCheckbox
					icon={<CalendarIcon />}
					iconOrientation="left"
					variant="secondary"
					size="sm"
					checked={isNextCycleOnly}
					onCheckedChange={() => form.setFieldValue("billingBehavior", "none")}
					className={cn("rounded-l-none", !isNextCycleOnly && "border-l-0")}
				>
					Next Cycle Only
				</IconCheckbox>
			</AdvancedToggleRow>

			{showResetBillingCycle && (
				<AdvancedToggleRow label="Reset Billing Cycle">
					<IconCheckbox
						icon={<ArrowCounterClockwiseIcon />}
						iconOrientation="left"
						variant="secondary"
						size="sm"
						checked={resetBillingCycle}
						onCheckedChange={(checked) =>
							form.setFieldValue("resetBillingCycle", !!checked)
						}
					>
						Reset Now
					</IconCheckbox>
				</AdvancedToggleRow>
			)}
		</AdvancedSection>
	);
}
