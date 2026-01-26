import { EllipsisVertical } from "lucide-react";
import { forwardRef } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const ToolbarButton = forwardRef<HTMLButtonElement, ButtonProps>(
	(props, ref) => {
		return (
			<Button
				ref={ref}
				isIcon
				variant="ghost"
				className={cn(
					"rounded-lg !h-5 !w-5 transition-all duration-100 hover:bg-stone-50",
					props?.className,
				)}
				{...props}
			>
				<EllipsisVertical size={12} />
			</Button>
		);
	},
);
