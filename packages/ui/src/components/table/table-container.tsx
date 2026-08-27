import { cn } from "@autumn/ui/lib/utils";

export function TableContainer({
	className,
	children,
}: {
	className?: string;
	children: React.ReactNode;
}) {
	return (
		<div data-slot="table-container" className={cn("flex flex-col", className)}>
			{children}
		</div>
	);
}
