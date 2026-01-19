import { cn } from "@/lib/utils";

type StatusBadgeVariant = "created" | "removed";

const variantStyles: Record<StatusBadgeVariant, string> = {
	created: "bg-green-500/20 text-green-500",
	removed: "bg-red-500/20 text-red-500",
};

interface StatusBadgeProps {
	variant: StatusBadgeVariant;
	children: React.ReactNode;
}

export function StatusBadge({ variant, children }: StatusBadgeProps) {
	return (
		<span
			className={cn(
				"px-2 py-0.5 rounded-md text-xs font-medium",
				variantStyles[variant],
			)}
		>
			{children}
		</span>
	);
}
