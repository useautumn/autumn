import { WarningIcon } from "@phosphor-icons/react";
import { motion } from "motion/react";
import { CheckoutBackground } from "@/components/checkout/CheckoutBackground";
import { STANDARD_TRANSITION } from "@/lib/animations";

export function CheckoutErrorState({ message }: { message: string }) {
	return (
		<CheckoutBackground>
			<motion.div
				className="flex flex-col items-start gap-1"
				initial={{ opacity: 0, y: 8 }}
				animate={{ opacity: 1, y: 0 }}
				transition={STANDARD_TRANSITION}
			>
				<div className="flex items-center gap-2">
					<WarningIcon className="h-4 w-4 text-destructive shrink-0" weight="bold" />
					<span className="text-foreground tracking-tight">Something went wrong</span>
				</div>
				<p className="text-xs text-muted-foreground pl-6">{message}</p>
			</motion.div>
		</CheckoutBackground>
	);
}
