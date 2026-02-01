import type { ConfirmCheckoutResponse } from "@autumn/shared";
import { motion } from "motion/react";
import { CheckoutBackground } from "@/components/checkout/CheckoutBackground";
import { STANDARD_TRANSITION, GENTLE_SPRING } from "@/lib/animations";

export function CheckoutSuccessState({
	result,
}: {
	result: ConfirmCheckoutResponse;
}) {
	return (
		<CheckoutBackground>
			<motion.div
				className="flex flex-col items-center justify-center gap-4"
				initial="initial"
				animate="animate"
			>
				{/* Success icon with animated checkmark */}
				<motion.div
					className="size-12 rounded-full bg-primary/10 flex items-center justify-center"
					initial={{ scale: 0, opacity: 0 }}
					animate={{ scale: 1, opacity: 1 }}
					transition={{
						...GENTLE_SPRING,
						delay: 0.1,
					}}
				>
					<motion.svg
						className="size-6 text-primary"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						strokeWidth={2}
						aria-hidden="true"
						initial={{ scale: 0.5, opacity: 0 }}
						animate={{ scale: 1, opacity: 1 }}
						transition={{
							...GENTLE_SPRING,
							delay: 0.25,
						}}
					>
						<motion.path
							strokeLinecap="round"
							strokeLinejoin="round"
							d="M5 13l4 4L19 7"
							initial={{ pathLength: 0 }}
							animate={{ pathLength: 1 }}
							transition={{
								duration: 0.4,
								delay: 0.35,
								ease: "easeOut",
							}}
						/>
					</motion.svg>
				</motion.div>

				{/* Text content */}
				<motion.div
					className="text-center"
					initial={{ opacity: 0, y: 10 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ ...STANDARD_TRANSITION, delay: 0.4 }}
				>
					<h2 className="text-lg font-semibold">Purchase Complete</h2>
					<p className="text-muted-foreground">
						Your order has been confirmed.
					</p>
				</motion.div>

				{/* Invoice ID */}
				{result.invoice_id && (
					<motion.p
						className="text-sm text-muted-foreground"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						transition={{ ...STANDARD_TRANSITION, delay: 0.55 }}
					>
						Invoice ID: {result.invoice_id}
					</motion.p>
				)}
			</motion.div>
		</CheckoutBackground>
	);
}
