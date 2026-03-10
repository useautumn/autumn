import type { Icon } from "@phosphor-icons/react";
import { motion } from "motion/react";
import { CheckoutBackground } from "@/components/checkout/layout/CheckoutBackground";
import { STANDARD_TRANSITION } from "@/lib/animations";

export function CheckoutTerminalState({
	title,
	message,
	Icon,
	iconClassName,
}: {
	title: string;
	message: string;
	Icon: Icon;
	iconClassName?: string;
}) {
	return (
		<CheckoutBackground
			containerClassName="max-w-lg"
			contentClassName="p-8 sm:p-9"
		>
			<motion.div
				className="flex w-full items-center justify-start"
				initial={{ opacity: 0, y: 8 }}
				animate={{ opacity: 1, y: 0 }}
				transition={STANDARD_TRANSITION}
			>
				<div className="flex max-w-md flex-col gap-2.5 text-left">
					<div className="flex items-center gap-2.5">
						<Icon
							className={`h-[1.4rem] w-[1.4rem] shrink-0 text-foreground/70 ${iconClassName ?? ""}`}
							weight="regular"
						/>
						<h2 className="text-[1.35rem] leading-tight tracking-tight text-foreground">
							{title}
						</h2>
					</div>
					<p className="text-[1rem] leading-7 text-muted-foreground">
						{message}
					</p>
				</div>
			</motion.div>
		</CheckoutBackground>
	);
}
