import type { ApiFreeTrialV2 } from "@autumn/shared";
import { Gift } from "@phosphor-icons/react";
import { motion } from "motion/react";
import { CardBackground } from "@/components/checkout/CardBackground";
import { LAYOUT_TRANSITION, listItemVariants } from "@/lib/animations";
import { formatTrialDuration } from "@/utils/trialUtils";

interface FreeTrialCardProps {
	freeTrial: ApiFreeTrialV2;
	trialAvailable: boolean;
}

export function FreeTrialCard({ freeTrial, trialAvailable }: FreeTrialCardProps) {
	const duration = formatTrialDuration({
		duration_type: freeTrial.duration_type,
		duration_length: freeTrial.duration_length,
	});

	return (
		<motion.div
			layout
			layoutId="free-trial-card"
			variants={listItemVariants}
			initial="initial"
			animate="animate"
			exit="exit"
			transition={{ layout: LAYOUT_TRANSITION, opacity: { duration: 0.2 } }}
			className="rounded-lg border border-border overflow-hidden"
		>
			<CardBackground>
				{/* Header */}
				<div className="flex items-center justify-between px-3 py-2 border-b bg-background/50">
					<div className="flex items-center gap-2">
						<Gift
							className="h-4 w-4 text-blue-500 dark:text-blue-400"
							weight="bold"
						/>
						<span className="text-sm font-medium text-foreground">
							Free Trial
						</span>
					</div>
					<span className="text-sm font-medium text-foreground">
						{duration}
					</span>
				</div>

				{/* Content */}
				<div className="px-3 py-2.5">
					{trialAvailable ? (
						<>
							<p className="text-sm text-muted-foreground">
								Try free for {duration} before subscribing
							</p>
							<p className="text-xs text-muted-foreground mt-1">
								{freeTrial.card_required
									? "Card required to start"
									: "No payment required to start"}
							</p>
						</>
					) : (
						<p className="text-sm text-muted-foreground">
							Trial already used
						</p>
					)}
				</div>
			</CardBackground>
		</motion.div>
	);
}
