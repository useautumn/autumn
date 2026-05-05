import type { Icon } from "@phosphor-icons/react";
import { motion } from "motion/react";
import { CheckoutBackground } from "@/components/checkout/layout/CheckoutBackground";
import { GENTLE_SPRING, STANDARD_TRANSITION } from "@/lib/animations";

type Tone = "primary" | "muted" | "destructive";

const toneClasses: Record<Tone, { bg: string; ring: string; icon: string }> = {
	primary: {
		bg: "bg-primary/10",
		ring: "ring-primary/15",
		icon: "text-primary",
	},
	muted: {
		bg: "bg-muted",
		ring: "ring-border",
		icon: "text-foreground/70",
	},
	destructive: {
		bg: "bg-destructive/10",
		ring: "ring-destructive/15",
		icon: "text-destructive",
	},
};

export function CheckoutTerminalState({
	title,
	message,
	Icon,
	tone = "muted",
}: {
	title: string;
	message: string;
	Icon: Icon;
	tone?: Tone;
}) {
	const styles = toneClasses[tone];

	return (
		<CheckoutBackground
			containerClassName="max-w-md"
			contentClassName="px-8 py-12 sm:px-10 sm:py-14"
		>
			<div className="flex flex-col items-center gap-6 text-center">
				<motion.div
					className={`flex h-12 w-12 items-center justify-center rounded-full ring-1 ${styles.bg} ${styles.ring}`}
					initial={{ opacity: 0, scale: 0.8 }}
					animate={{ opacity: 1, scale: 1 }}
					transition={GENTLE_SPRING}
				>
					<Icon
						className={`h-5 w-5 ${styles.icon}`}
						weight="bold"
					/>
				</motion.div>

				<motion.div
					className="flex flex-col gap-2"
					initial={{ opacity: 0, y: 6 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ ...STANDARD_TRANSITION, delay: 0.05 }}
				>
					<h2 className="text-lg font-medium tracking-tight text-foreground">
						{title}
					</h2>
					<p className="text-sm leading-relaxed text-muted-foreground">
						{message}
					</p>
				</motion.div>
			</div>
		</CheckoutBackground>
	);
}
