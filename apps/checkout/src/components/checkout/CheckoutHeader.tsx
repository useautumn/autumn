import { motion } from "motion/react";
import { Skeleton } from "@/components/ui/skeleton";
import { useCheckoutContext } from "@/contexts/CheckoutContext";
import { GENTLE_SPRING, STANDARD_TRANSITION } from "@/lib/animations";

export function CheckoutHeader() {
	const { org, status, headerDescription } = useCheckoutContext();
	const isLoading = status.isLoading;
	return (
		<div className="flex flex-col gap-4">
			{/* Org branding */}
			{isLoading ? (
				<Skeleton className="h-5 w-32" />
			) : org ? (
				<motion.div
					className="flex items-center gap-2 min-w-0"
					initial={{ opacity: 0, y: -5 }}
					animate={{ opacity: 1, y: 0 }}
					transition={STANDARD_TRANSITION}
				>
					{org.logo && (
						<motion.img
							src={org.logo}
							alt={org.name}
							className="h-6 w-6 rounded-full object-cover shrink-0"
							initial={{ scale: 0.8, opacity: 0 }}
							animate={{ scale: 1, opacity: 1 }}
							transition={GENTLE_SPRING}
						/>
					)}
					<span className="text-sm text-muted-foreground truncate">{org.name}</span>
				</motion.div>
			) : null}

			{/* Title and description */}
			<div className="flex flex-col gap-2">
				<h1 className="text-2xl text-foreground tracking-tight">
					Confirm your order
				</h1>
				{isLoading ? (
					<Skeleton className="h-5 w-80" />
				) : headerDescription ? (
					<motion.p
						className="text-sm text-muted-foreground"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						transition={STANDARD_TRANSITION}
					>
						{headerDescription}
					</motion.p>
				) : null}
			</div>
		</div>
	);
}
