import { Card, CardContent, CardHeader, Skeleton } from "@autumn/ui";

export const Shapes = () => (
	<div className="flex flex-col gap-3">
		<Skeleton className="h-4 w-48" />
		<Skeleton className="h-4 w-32" />
		<Skeleton className="h-8 w-8 rounded-full" />
	</div>
);

export const CustomerRow = () => (
	<div className="flex items-center gap-3">
		<Skeleton className="size-8 rounded-full" />
		<div className="flex flex-col gap-1.5">
			<Skeleton className="h-3.5 w-32" />
			<Skeleton className="h-3 w-48" />
		</div>
	</div>
);

export const TableLoading = () => (
	<div className="flex flex-col gap-2">
		{["customer", "plan", "status", "mrr"].map((row) => (
			<div className="flex items-center gap-3" key={row}>
				<Skeleton className="h-3.5 w-40" />
				<Skeleton className="h-3.5 w-24" />
				<Skeleton className="h-5 w-16 rounded-lg" />
				<Skeleton className="ml-auto h-3.5 w-16" />
			</div>
		))}
	</div>
);

export const CardLoading = () => (
	<Card>
		<CardHeader className="gap-2">
			<Skeleton className="h-4 w-28" />
			<Skeleton className="h-3 w-56" />
		</CardHeader>
		<CardContent className="flex flex-col gap-2">
			<Skeleton className="h-8 w-24" />
			<Skeleton className="h-3 w-full" />
			<Skeleton className="h-3 w-2/3" />
		</CardContent>
	</Card>
);
