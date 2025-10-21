import type { MouseEvent, ReactElement } from "react";
import { Button } from "@/components/ui/button";

interface HoverClickableIconProps {
	icon: ReactElement;
	onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
	disabled?: boolean;
	className?: string;
	size?: number;
	"aria-label"?: string;
}

export const HoverClickableIcon = ({
	icon,
	onClick,
	disabled = false,
	className = "",
	size = 24,
	"aria-label": ariaLabel,
}: HoverClickableIconProps) => {
	return (
		<Button
			variant="ghost"
			size="sm"
			className={`group/btn rounded-md flex items-center justify-center p-1 disabled:opacity-50 disabled:cursor-not-allowed ${className} size-[${size}px]`}
			onClick={(e) => {
				e.stopPropagation();
				onClick?.(e);
			}}
			disabled={disabled}
			aria-label={ariaLabel}
		>
			<div
				className={
					disabled
						? "text-t6"
						: "text-t3 group-hover/btn:text-primary transition-colors"
				}
			>
				{icon}
			</div>
		</Button>
	);
};
