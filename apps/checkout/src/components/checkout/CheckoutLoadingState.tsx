import { CheckoutBackground } from "@/components/checkout/CheckoutBackground";
import { CheckoutFooter } from "@/components/checkout/CheckoutFooter";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

export function CheckoutLoadingState() {
	return (
		<CheckoutBackground>
			<div className="flex flex-col gap-8">
				{/* Header skeleton with org branding */}
				<div className="flex flex-col gap-4">
					{/* Org branding skeleton */}
					<Skeleton className="h-5 w-32" />

					{/* Title and description - use actual content */}
					<div className="flex flex-col gap-2">
						<h1 className="text-2xl text-foreground">Confirm your order</h1>
						<p className="text-base text-muted-foreground">
							Please review your order and confirm to complete your purchase.
						</p>
					</div>
				</div>

				{/* Main content - two columns */}
				<div className="flex flex-col lg:flex-row gap-8">
					{/* Left column - Plan selection skeleton */}
					<div className="flex flex-col gap-4 lg:w-96 h-full">
						<Card className="py-0 gap-0 flex-1">
							{/* Plan header */}
							<div className="flex items-center justify-between px-4 py-4">
								<Skeleton className="h-5 w-32" />
								<Skeleton className="h-5 w-24" />
							</div>

							{/* Feature rows */}
							{[1, 2, 3, 4].map((i) => (
								<div key={i}>
									<div className="px-4">
										<Separator className="w-auto" />
									</div>
									<div className="flex items-center justify-between px-4 py-3">
										<div className="flex items-center gap-3">
											<Skeleton className="h-4 w-4" />
											<Skeleton className="h-4 w-24" />
										</div>
										<Skeleton className="h-4 w-20" />
									</div>
								</div>
							))}

							{/* Prepaid feature row */}
							<div className="px-4">
								<Separator className="w-auto" />
							</div>
							<div className="flex items-center justify-between px-4 py-4">
								<div className="flex flex-col gap-1">
									<Skeleton className="h-5 w-20" />
									<Skeleton className="h-4 w-28" />
								</div>
								<div className="flex items-center gap-4">
									<Skeleton className="h-5 w-16" />
									<Skeleton className="h-9 w-28 rounded-md" />
								</div>
							</div>
						</Card>
					</div>

					{/* Right column - Order summary skeleton */}
					<div className="flex flex-col gap-6 lg:w-96">
						{/* Order summary */}
						<div className="flex flex-col">
							{/* Plan name and date */}
							<div className="flex items-center justify-between py-3">
								<Skeleton className="h-5 w-32" />
								<Skeleton className="h-4 w-24" />
							</div>
							<Separator />

							{/* Line items */}
							{[1, 2, 3].map((i) => (
								<div key={i}>
									<div className="flex items-center justify-between py-3">
										<Skeleton className="h-4 w-24" />
										<Skeleton className="h-4 w-12" />
									</div>
									<Separator />
								</div>
							))}

							{/* Total */}
							<div className="flex items-center justify-between py-3">
								<Skeleton className="h-4 w-12" />
								<Skeleton className="h-4 w-14" />
							</div>
						</div>

						{/* Spacer */}
						<div className="flex-1" />

						{/* Bottom section */}
						<div className="flex flex-col gap-6">
							<Separator />

							{/* Amount due today */}
							<div className="flex items-center justify-between">
								<Skeleton className="h-5 w-32" />
								<Skeleton className="h-6 w-16" />
							</div>

							{/* Button */}
							<Skeleton className="h-12 w-full rounded-lg" />
						</div>
					</div>
				</div>

				<CheckoutFooter disabled />
			</div>
		</CheckoutBackground>
	);
}
