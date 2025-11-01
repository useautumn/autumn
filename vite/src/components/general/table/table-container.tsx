import { cn } from "@/lib/utils";

export function TableContainer({
	className,
	children,
}: {
	className?: string;
	children: React.ReactNode;
}) {
	return (
		<div className={cn("flex flex-col rounded-xl", className)}>{children}</div>
	);
}
