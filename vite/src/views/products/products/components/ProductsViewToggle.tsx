import { ListBulletsIcon, SquareHalfIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

export type ProductsViewMode = "list" | "ai";

interface ProductsViewToggleProps {
	value: ProductsViewMode;
	onValueChange: (value: ProductsViewMode) => void;
	className?: string;
}

/**
 * Icon toggle to switch between list view and AI chat view
 */
export function ProductsViewToggle({
	value,
	onValueChange,
	className,
}: ProductsViewToggleProps) {
	const options: Array<{
		value: ProductsViewMode;
		icon: React.ReactNode;
		title: string;
	}> = [
		{
			value: "list",
			icon: <ListBulletsIcon className="size-3.5" />,
			title: "List view",
		},
		{
			value: "ai",
			icon: <SquareHalfIcon className="size-3.5" />,
			title: "AI assistant",
		},
	];

	return (
		<div className={cn("flex items-center", className)}>
			{options.map((option, index) => {
				const isActive = value === option.value;
				const isFirst = index === 0;
				const isLast = index === options.length - 1;

				return (
					<button
						key={option.value}
						type="button"
						title={option.title}
						onClick={() => onValueChange(option.value)}
						className={cn(
							"flex items-center justify-center p-1.5 h-7 w-7 border transition-none outline-none text-t3",
							"hover:text-primary focus-visible:text-primary",
							isActive && "text-primary bg-white dark:bg-zinc-900",
							!isActive && "bg-zinc-100 dark:bg-zinc-800",
							isFirst && "rounded-l-md border-l",
							!isFirst && "border-l-0",
							isLast && "rounded-r-md",
						)}
					>
						{option.icon}
					</button>
				);
			})}
		</div>
	);
}
