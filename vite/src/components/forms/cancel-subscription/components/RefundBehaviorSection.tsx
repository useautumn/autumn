import { AnimatePresence, motion } from "motion/react";
import { GroupedTabButton } from "@/components/v2/buttons/GroupedTabButton";
import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";
import { SHEET_ANIMATION } from "@/views/products/plan/planAnimations";
import { useCancelSubscriptionContext } from "../context/CancelSubscriptionContext";

export function RefundBehaviorSection() {
	const { refundBehavior, setRefundBehavior, showRefundToggle } =
		useCancelSubscriptionContext();

	return (
		<AnimatePresence mode="wait">
			{showRefundToggle && (
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					exit={{ opacity: 0, y: 20 }}
					transition={SHEET_ANIMATION}
				>
					<SheetSection title="Credit Application" withSeparator={false}>
						<GroupedTabButton
							value={refundBehavior}
							onValueChange={(value) => setRefundBehavior(value)}
							options={[
								{
									value: "grant_invoice_credits",
									label: "Credit to balance",
								},
								{
									value: "refund_payment_method",
									label: "Refund to card",
								},
							]}
						/>
					</SheetSection>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
