import { Button, ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const TableButton = ({
	className,
	children,
	icon,
	onClick,
}: {
	className?: string;
	children?: any;
	icon?: React.ReactNode;
	onClick?: any;
}) => {
	return (
		<Button
			variant="outline"
			size="icon"
			className={cn(
				"h-6 px-2 text-t2 w-fit font-mono rounded-md truncate justify-start",
				"bg-transparent text-t3 border-none px-1 shadow-none max-w-full",
				className,
			)}
			onClick={(e) => {
				e.preventDefault();
				e.stopPropagation();
				onClick?.();
			}}
		>
			{children && <span className="truncate block">{children}</span>}
			{icon && <div className="flex items-center justify-center">{icon}</div>}
		</Button>
	);
};
