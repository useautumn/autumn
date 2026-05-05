import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { useCheckoutContext } from "@/contexts/CheckoutContext";
import { FAST_TRANSITION } from "@/lib/animations";
import { getCheckoutApiErrorMessage } from "@/utils/checkoutApiErrorUtils";
import { PromoCodeAppliedRow } from "./PromoCodeAppliedRow";
import { PromoCodeCollapsedTrigger } from "./PromoCodeCollapsedTrigger";
import { PromoCodeInput } from "./PromoCodeInput";

export function PromoCodeSection() {
	const [isOpen, setIsOpen] = useState(false);
	const [codeInput, setCodeInput] = useState("");
	const [discountError, setDiscountError] = useState<string | null>(null);
	const {
		appliedPromotionCode,
		status,
		handleApplyDiscount,
		handleClearDiscount,
	} = useCheckoutContext();

	const isBusy = status.isUpdating || status.isConfirming;
	const stateKey = appliedPromotionCode
		? "applied"
		: isOpen
			? "expanded"
			: "collapsed";

	const handleSubmit = async () => {
		setDiscountError(null);
		try {
			await handleApplyDiscount(codeInput);
		} catch (error) {
			setDiscountError(
				getCheckoutApiErrorMessage({
					error,
					fallbackMessage: "Could not apply promo code",
				}),
			);
		}
	};

	const handleRemove = async () => {
		await handleClearDiscount();
		setCodeInput("");
		setDiscountError(null);
	};

	return (
		<div className="flex flex-col gap-2">
			<div className="relative h-9">
				<AnimatePresence initial={false}>
					<motion.div
						key={stateKey}
						className="absolute inset-0"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={FAST_TRANSITION}
					>
						{stateKey === "collapsed" && (
							<PromoCodeCollapsedTrigger onOpen={() => setIsOpen(true)} />
						)}
						{stateKey === "applied" && appliedPromotionCode && (
							<PromoCodeAppliedRow
								code={appliedPromotionCode}
								onRemove={handleRemove}
								disabled={isBusy}
							/>
						)}
						{stateKey === "expanded" && (
							<PromoCodeInput
								value={codeInput}
								onChange={(value) => {
									setCodeInput(value);
									setDiscountError(null);
								}}
								onSubmit={handleSubmit}
								onBlurEmpty={() => setIsOpen(false)}
								isApplying={status.isUpdating && !!codeInput.trim()}
								disabled={isBusy}
							/>
						)}
					</motion.div>
				</AnimatePresence>
			</div>

			<AnimatePresence>
				{discountError && (
					<motion.p
						className="text-xs text-destructive"
						initial={{ opacity: 0, height: 0 }}
						animate={{ opacity: 1, height: "auto" }}
						exit={{ opacity: 0, height: 0 }}
						transition={FAST_TRANSITION}
					>
						{discountError}
					</motion.p>
				)}
			</AnimatePresence>
		</div>
	);
}
