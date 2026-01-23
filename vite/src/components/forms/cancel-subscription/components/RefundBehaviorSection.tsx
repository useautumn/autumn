import { CreditCardIcon, WalletIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useUpdateSubscriptionFormContext } from "@/components/forms/update-subscription-v2";
import {
	OptionCard,
	OptionCardContent,
	OptionCardDescription,
	OptionCardGroup,
	OptionCardIcon,
	OptionCardLabel,
} from "@/components/v2/selections/OptionCard";
import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";

export function RefundBehaviorSection() {
	const { form, formValues, previewQuery } = useUpdateSubscriptionFormContext();

	const cancelAction = formValues.cancelAction;
	const refundBehavior = formValues.refundBehavior ?? "grant_invoice_credits";

	const showRefundToggle =
		cancelAction === "cancel_immediately" &&
		!!previewQuery.data &&
		previewQuery.data.total < 0;

	return (
		<AnimatePresence initial={false}>
			{showRefundToggle && (
				<motion.div
					initial={{ height: 0, opacity: 0 }}
					animate={{ height: "auto", opacity: 1 }}
					exit={{ height: 0, opacity: 0 }}
					transition={{ duration: 0.2, ease: "easeInOut" }}
					style={{ overflow: "hidden" }}
				>
					<SheetSection title="Credit application" withSeparator>
						<OptionCardGroup>
							<OptionCard
								selected={refundBehavior === "grant_invoice_credits"}
								onClick={() =>
									form.setFieldValue("refundBehavior", "grant_invoice_credits")
								}
							>
								<OptionCardIcon>
									<WalletIcon size={18} weight="duotone" />
								</OptionCardIcon>
								<OptionCardContent>
									<OptionCardLabel>Credit to balance</OptionCardLabel>
									<OptionCardDescription>
										Add credit to customer's account for future invoices
									</OptionCardDescription>
								</OptionCardContent>
							</OptionCard>
							<OptionCard
								selected={refundBehavior === "refund_payment_method"}
								onClick={() =>
									form.setFieldValue("refundBehavior", "refund_payment_method")
								}
							>
								<OptionCardIcon>
									<CreditCardIcon size={18} weight="duotone" />
								</OptionCardIcon>
								<OptionCardContent>
									<OptionCardLabel>Refund to card</OptionCardLabel>
									<OptionCardDescription>
										Refund the unused amount back to their payment method
									</OptionCardDescription>
								</OptionCardContent>
							</OptionCard>
						</OptionCardGroup>
					</SheetSection>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
