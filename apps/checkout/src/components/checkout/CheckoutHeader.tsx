import { motion } from "motion/react";
import { Skeleton } from "@/components/ui/skeleton";
import { STANDARD_TRANSITION, GENTLE_SPRING } from "@/lib/animations";

interface CheckoutHeaderProps {
	org?: {
		name: string;
		logo: string | null;
	};
	isLoading?: boolean;
}

export function CheckoutHeader({ org, isLoading = false }: CheckoutHeaderProps) {
	return (
		<div className="flex flex-col gap-4">
			{/* Org branding */}
			{isLoading ? (
				<Skeleton className="h-5 w-32" />
			) : org ? (
				<motion.div
					className="flex items-center gap-2"
					initial={{ opacity: 0, y: -5 }}
					animate={{ opacity: 1, y: 0 }}
					transition={STANDARD_TRANSITION}
				>
					{org.logo && (
						<motion.img
							src={org.logo}
							alt={org.name}
							className="h-6 w-6 rounded-full object-cover"
							initial={{ scale: 0.8, opacity: 0 }}
							animate={{ scale: 1, opacity: 1 }}
							transition={GENTLE_SPRING}
						/>
					)}
					<span className="text-sm text-muted-foreground">{org.name}</span>
				</motion.div>
			) : null}

			{/* Title and description - always show these, no skeleton needed */}
			<div className="flex flex-col gap-2">
				<h1 className="text-2xl text-foreground tracking-tight">Confirm your order</h1>
				<p className="text-base text-muted-foreground">
					Please review your order and confirm to complete your purchase.
				</p>
			</div>
		</div>
	);
}
