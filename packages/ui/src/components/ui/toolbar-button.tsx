import { EllipsisVertical } from "lucide-react";
import { forwardRef } from "react";
import { cn } from "../../lib/utils";
import { Button, type ButtonProps } from "./button";

export const ToolbarButton = forwardRef<HTMLButtonElement, ButtonProps>(
	(props, ref) => {
		return (
			<Button
				ref={ref}
				variant="skeleton"
				size="icon"
				className={cn(
					"rounded-lg !h-5 !w-5 p-0 transition-all duration-100",
					props?.className,
				)}
				{...props}
				onClick={(e) => {
					e.stopPropagation();
					e.preventDefault();
					props.onClick?.(e);
				}}
			>
				<EllipsisVertical size={12} />
			</Button>
		);
	},
);
