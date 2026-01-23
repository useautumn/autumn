import { CreditCardIcon, WalletIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useUpdateSubscriptionFormContext } from "@/components/forms/update-subscription-v2";
import { COLLAPSE_TRANSITION } from "@/components/forms/update-subscription-v2/constants/animationConstants";
import { PanelButton } from "@/components/v2/buttons/PanelButton";
import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";

export function RefundBehaviorSection() {
	const { form, formValues, previewQuery } = useUpdateSubscriptionFormContext();

	const cancelAction = formValues.cancelAction;
	const refundBehavior = formValues.refundBehavior ?? "grant_invoice_credits";
	const previewTotal = previewQuery.data?.total ?? -1;

	const showRefundToggle =
		cancelAction === "cancel_immediately" && previewTotal < 0;

	return (
		<AnimatePresence initial={false}>
			{showRefundToggle && (
				<motion.div
					initial={{ height: 0, opacity: 0 }}
					animate={{ height: "auto", opacity: 1 }}
					exit={{ height: 0, opacity: 0 }}
					transition={COLLAPSE_TRANSITION}
					style={{ overflow: "hidden" }}
				>
					<SheetSection title="Refund method" withSeparator>
						<div className="space-y-4">
							<div className="flex w-full items-center gap-4">
								<PanelButton
									isSelected={refundBehavior === "grant_invoice_credits"}
									onClick={() =>
										form.setFieldValue(
											"refundBehavior",
											"grant_invoice_credits",
										)
									}
									icon={<WalletIcon size={18} weight="duotone" />}
								/>
								<div className="flex-1">
									<div className="text-body-highlight mb-1">
										Credit to balance
									</div>
									<div className="text-body-secondary leading-tight">
										Add credit to customer's account for future invoices.
									</div>
								</div>
							</div>

							<div className="flex w-full items-center gap-4">
								<PanelButton
									isSelected={refundBehavior === "refund_payment_method"}
									onClick={() =>
										form.setFieldValue(
											"refundBehavior",
											"refund_payment_method",
										)
									}
									icon={<CreditCardIcon size={18} weight="duotone" />}
								/>
								<div className="flex-1">
									<div className="text-body-highlight mb-1">Refund to card</div>
									<div className="text-body-secondary leading-tight">
										Refund the unused amount back to their payment method.
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
