import { cp } from "@autumn/shared";
import { CalendarCheckIcon, LightningIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useUpdateSubscriptionFormContext } from "@/components/forms/update-subscription-v2";
import { COLLAPSE_TRANSITION } from "@/components/forms/update-subscription-v2/constants/animationConstants";
import { PanelButton } from "@/components/v2/buttons/PanelButton";
import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";

export function BillingBehaviorSection() {
	const { form, formValues, formContext } = useUpdateSubscriptionFormContext();
	const { customerProduct } = formContext;

	const cancelAction = formValues.cancelAction;
	const billingBehavior = formValues.billingBehavior ?? "prorate_immediately";

	// Only show billing behavior options when:
	// 1. Cancel action is "cancel_immediately"
	// 2. Product is NOT free or one-off (has recurring billing)
	const { valid: isFreeOrOneOff } = cp(customerProduct).free().or.oneOff();
	const showBillingBehavior =
		cancelAction === "cancel_immediately" && !isFreeOrOneOff;

	return (
		<AnimatePresence initial={false}>
			{showBillingBehavior && (
				<motion.div
					initial={{ height: 0, opacity: 0 }}
					animate={{ height: "auto", opacity: 1 }}
					exit={{ height: 0, opacity: 0 }}
					transition={COLLAPSE_TRANSITION}
					style={{ overflow: "hidden" }}
				>
					<SheetSection title="Billing Behavior" withSeparator>
						<div className="space-y-4">
							<div className="flex w-full items-center gap-4">
								<PanelButton
									isSelected={billingBehavior === "prorate_immediately"}
									onClick={() =>
										form.setFieldValue("billingBehavior", "prorate_immediately")
									}
									icon={<LightningIcon size={18} weight="duotone" />}
								/>
								<div className="flex-1">
									<div className="text-body-highlight mb-1">
										Prorate immediately
									</div>
									<div className="text-body-secondary leading-tight">
										Issue a prorated credit or refund for the unused portion of
										the billing period.
									</div>
								</div>
							</div>

							<div className="flex w-full items-center gap-4">
								<PanelButton
									isSelected={billingBehavior === "next_cycle_only"}
									onClick={() =>
										form.setFieldValue("billingBehavior", "next_cycle_only")
									}
									icon={<CalendarCheckIcon size={18} weight="duotone" />}
								/>
								<div className="flex-1">
									<div className="text-body-highlight mb-1">
										Next cycle only
									</div>
									<div className="text-body-secondary leading-tight">
										No charges or credits issued. Access ends at the current
										period's end.
									</div>
								</div>
							</div>
						</div>
					</SheetSection>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
