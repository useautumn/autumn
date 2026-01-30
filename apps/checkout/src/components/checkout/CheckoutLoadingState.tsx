import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

export function CheckoutLoadingState() {
	return (
		<div className="min-h-screen bg-background px-6 py-12 flex items-center justify-center">
			<div className="w-full max-w-lg flex flex-col gap-8">
				{/* Header */}
				<div className="flex flex-col gap-2">
					<Skeleton className="h-8 w-32" />
					<Skeleton className="h-5 w-48" />
				</div>

				{/* Line items card */}
				<div className="bg-card border border-border shadow-sm rounded-lg divide-y divide-border">
					<div className="flex justify-between items-start gap-4 px-4 py-3.5">
						<div className="flex flex-col gap-2 flex-1">
							<Skeleton className="h-5 w-3/4" />
							<Skeleton className="h-4 w-1/2" />
						</div>
						<Skeleton className="h-5 w-16" />
					</div>
					<div className="flex justify-between items-start gap-4 px-4 py-3.5">
						<div className="flex flex-col gap-2 flex-1">
							<Skeleton className="h-5 w-2/3" />
							<Skeleton className="h-4 w-2/5" />
						</div>
						<Skeleton className="h-5 w-16" />
					</div>
				</div>

				<Separator />

				{/* Amount due today */}
				<div className="flex flex-col gap-2">
					<div className="flex justify-between items-center">
						<Skeleton className="h-6 w-40" />
						<Skeleton className="h-9 w-24" />
					</div>
					<Skeleton className="h-4 w-56" />
				</div>

				{/* Button */}
				<div className="pt-4">
					<Skeleton className="h-12 w-full rounded-xl" />
				</div>
			</div>
		</div>
	);
}
