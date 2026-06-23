import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import { IconButton } from "./icon-button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

export function IconTooltipButton({
	tooltip,
	icon,
	onClick,
	disabled,
	className,
}: {
	tooltip: string;
	icon: ReactNode;
	onClick?: () => void;
	disabled?: boolean;
	className?: string;
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<IconButton
					variant="secondary"
					size="icon"
					iconOrientation="center"
					onClick={onClick}
					disabled={disabled}
					aria-label={tooltip}
					icon={icon}
					className={cn("shrink-0 text-tertiary-foreground", className)}
				/>
			</TooltipTrigger>
			<TooltipContent>{tooltip}</TooltipContent>
		</Tooltip>
	);
}
