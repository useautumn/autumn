import type { ConfirmCheckoutResponse } from "@autumn/shared";
import { CheckIcon } from "@phosphor-icons/react";
import { motion } from "motion/react";
import { CheckoutBackground } from "@/components/checkout/CheckoutBackground";
import { STANDARD_TRANSITION } from "@/lib/animations";

export function CheckoutSuccessState({
	result,
}: {
	result: ConfirmCheckoutResponse;
}) {
	return (
		<CheckoutBackground>
			<motion.div
				className="flex flex-col items-start gap-1"
				initial={{ opacity: 0, y: 8 }}
				animate={{ opacity: 1, y: 0 }}
				transition={STANDARD_TRANSITION}
			>
				<div className="flex items-center gap-2">
					<CheckIcon className="h-4 w-4 text-primary shrink-0" weight="bold" />
					<span className="text-foreground tracking-tight">Purchase complete</span>
				</div>
				<p className="text-xs text-muted-foreground pl-6">
					Your order has been confirmed
					{result.invoice_id && <span className="text-muted-foreground"> · {result.invoice_id}</span>}
				</p>
			</motion.div>
		</CheckoutBackground>
	);
}
