import { CheckIcon, PlusIcon, XIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useCheckoutContext } from "@/contexts/CheckoutContext";
import { FAST_TRANSITION } from "@/lib/animations";
import { getCheckoutApiErrorMessage } from "@/utils/checkoutApiErrorUtils";

export function PromoCodeSection() {
	const [isOpen, setIsOpen] = useState(false);
	const [codeInput, setCodeInput] = useState("");
	const [discountError, setDiscountError] = useState<string | null>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const {
		appliedPromotionCode,
		status,
		handleApplyDiscount,
		handleClearDiscount,
	} = useCheckoutContext();

	const code = codeInput.trim();
	const isBusy = status.isUpdating || status.isConfirming;
	const stateKey = appliedPromotionCode
		? "applied"
		: isOpen
			? "expanded"
			: "collapsed";

	useEffect(() => {
		if (stateKey === "expanded") inputRef.current?.focus();
	}, [stateKey]);

	const stateContent = (() => {
		if (stateKey === "collapsed") {
			return (
				<button
					type="button"
					onClick={() => setIsOpen(true)}
					className="flex h-9 items-center gap-1.5 self-start text-sm text-muted-foreground transition-colors hover:text-foreground"
				>
					<PlusIcon className="h-3.5 w-3.5" weight="bold" />
					Add promo code
				</button>
			);
		}
		if (stateKey === "applied") {
			return (
				<div className="flex h-9 items-center justify-between gap-2 text-sm">
					<span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
						<CheckIcon className="h-3.5 w-3.5 shrink-0 text-primary" weight="bold" />
						<span className="truncate">
							<span className="font-medium text-foreground">
								{appliedPromotionCode}
							</span>{" "}
							applied
						</span>
					</span>
					<button
						type="button"
						className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
						onClick={() => {
							setCodeInput("");
							setDiscountError(null);
							handleClearDiscount();
						}}
						disabled={isBusy}
					>
						<XIcon className="h-3 w-3" weight="bold" />
						Remove
					</button>
				</div>
			);
		}
		return (
			<form
				className="flex h-9 items-stretch rounded-lg border border-border bg-background transition-[box-shadow,border-color] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50"
				onSubmit={async (event) => {
					event.preventDefault();
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
				}}
			>
				<input
					ref={inputRef}
					type="text"
					value={codeInput}
					onChange={(event) => {
						setCodeInput(event.target.value);
						setDiscountError(null);
					}}
					onBlur={() => {
						if (!code) setIsOpen(false);
					}}
					placeholder="Promo code"
					className="min-w-0 flex-1 rounded-l-[7px] bg-transparent px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-50"
					disabled={isBusy}
				/>
				<button
					type="submit"
					disabled={!code || isBusy}
					className="rounded-r-[7px] border-l border-border px-3.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:text-muted-foreground disabled:hover:bg-transparent"
				>
					{status.isUpdating && code ? "Applying..." : "Apply"}
				</button>
			</form>
		);
	})();

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
						{stateContent}
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
