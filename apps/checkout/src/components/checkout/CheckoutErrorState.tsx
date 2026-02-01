import { Warning } from "@phosphor-icons/react";
import { motion } from "motion/react";
import { CheckoutBackground } from "@/components/checkout/CheckoutBackground";
import { STANDARD_TRANSITION, GENTLE_SPRING } from "@/lib/animations";

/** Subtle shake animation for error emphasis */
const shakeVariants = {
	initial: { x: 0 },
	animate: {
		x: [0, -4, 4, -4, 4, 0],
		transition: {
			duration: 0.4,
			delay: 0.2,
		},
	},
};

export function CheckoutErrorState({ message }: { message: string }) {
	return (
		<CheckoutBackground>
			<motion.div
				className="flex flex-col items-center justify-center gap-4"
				initial="initial"
				animate="animate"
			>
				{/* Error icon */}
				<motion.div
					className="size-12 rounded-full bg-destructive/10 flex items-center justify-center"
					initial={{ scale: 0, opacity: 0 }}
					animate={{ scale: 1, opacity: 1 }}
					transition={GENTLE_SPRING}
					variants={shakeVariants}
				>
					<motion.div
						initial={{ scale: 0.5, opacity: 0 }}
						animate={{ scale: 1, opacity: 1 }}
						transition={{ ...GENTLE_SPRING, delay: 0.15 }}
					>
						<Warning className="size-6 text-destructive" weight="fill" />
					</motion.div>
				</motion.div>

				{/* Text content */}
				<motion.div
					className="text-center"
					initial={{ opacity: 0, y: 10 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ ...STANDARD_TRANSITION, delay: 0.3 }}
				>
					<h2 className="text-lg font-semibold text-destructive">
						Something went wrong
					</h2>
					<p className="text-muted-foreground mt-1">{message}</p>
				</motion.div>
			</motion.div>
		</CheckoutBackground>
	);
}
