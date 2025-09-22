import { cn } from "@/lib/utils";

export const SidebarLabel = ({
	className,
	children,
}: {
	className?: string;
	children: React.ReactNode;
}) => {
	return (
		<span
			className={cn("text-t3 text-xs font-medium col-span-2 h-4", className)}
		>
			{children}
		</span>
	);
};
