import { cp } from "@autumn/shared";
import {
	ArrowCounterClockwiseIcon,
	CreditCardIcon,
	ReceiptIcon,
} from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useUpdateSubscriptionFormContext } from "@/components/forms/update-subscription-v2";
import { COLLAPSE_TRANSITION } from "@/components/forms/update-subscription-v2/constants/animationConstants";
import { PanelButton } from "@/components/v2/buttons/PanelButton";
import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";

type RefundMode = "credits" | "refund" | "none";

const getRefundMode = ({
	billingBehavior,
	refundBehavior,
}: {
	billingBehavior: string | null;
	refundBehavior: string | null;
}): RefundMode => {
	if (refundBehavior === "refund") return "refund";
	if (billingBehavior === "none") return "none";
	return "credits";
};

export function RefundBehaviorSection() {
	const { form, formValues, formContext } = useUpdateSubscriptionFormContext();
	const { customerProduct } = formContext;

	const cancelAction = formValues.cancelAction;
	const noBillingChanges = formValues.noBillingChanges;

	const { valid: isFreeOrOneOff } = cp(customerProduct).free().or.oneOff();
	const showSection =
		cancelAction === "cancel_immediately" &&
		!isFreeOrOneOff &&
		!noBillingChanges;

	const refundMode = getRefundMode({
		billingBehavior: formValues.billingBehavior,
		refundBehavior: formValues.refundBehavior,
	});

	const setRefundMode = (mode: RefundMode) => {
		switch (mode) {
			case "credits":
				form.setFieldValue("billingBehavior", "prorate_immediately");
				form.setFieldValue("refundBehavior", null);
				form.setFieldValue("refundAmount", null);
				break;
			case "refund":
				form.setFieldValue("billingBehavior", null);
				form.setFieldValue("refundBehavior", "refund");
				if (!formValues.refundAmount) {
					form.setFieldValue("refundAmount", "prorated");
				}
				break;
			case "none":
				form.setFieldValue("billingBehavior", "none");
				form.setFieldValue("refundBehavior", null);
				form.setFieldValue("refundAmount", null);
				break;
		}
	};

	return (
		<AnimatePresence initial={false}>
			{showSection && (
				<motion.div
					initial={{ height: 0, opacity: 0 }}
					animate={{ height: "auto", opacity: 1 }}
					exit={{ height: 0, opacity: 0 }}
					transition={COLLAPSE_TRANSITION}
					style={{ overflow: "hidden" }}
				>
					<SheetSection title="Refund Behavior" withSeparator>
						<div className="space-y-4">
							<div className="flex w-full items-center gap-4">
								<PanelButton
									isSelected={refundMode === "credits"}
									onClick={() => setRefundMode("credits")}
									icon={<ReceiptIcon size={18} weight="duotone" />}
								/>
								<div className="flex-1">
									<div className="text-body-highlight mb-1">
										Invoice credits
									</div>
									<div className="text-body-secondary leading-tight">
										Prorated credit applied to future invoices.
									</div>
								</div>
							</div>

							<div className="flex w-full items-center gap-4">
								<PanelButton
									isSelected={refundMode === "refund"}
									onClick={() => setRefundMode("refund")}
									icon={
										<ArrowCounterClockwiseIcon size={18} weight="duotone" />
									}
								/>
								<div className="flex-1">
									<div className="text-body-highlight mb-1">
										Refund to payment method
									</div>
									<div className="text-body-secondary leading-tight">
										Refund directly to the customer's original payment method.
									</div>
								</div>
							</div>

							<div className="flex w-full items-center gap-4">
								<PanelButton
									isSelected={refundMode === "none"}
									onClick={() => setRefundMode("none")}
									icon={<CreditCardIcon size={18} weight="duotone" />}
								/>
								<div className="flex-1">
									<div className="text-body-highlight mb-1">No refund</div>
									<div className="text-body-secondary leading-tight">
										No charges or credits issued. Access ends immediately.
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
