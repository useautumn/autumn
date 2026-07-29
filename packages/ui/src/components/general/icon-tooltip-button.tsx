import { IconButton } from "@autumn/ui/components/general/icon-button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@autumn/ui/components/ui/tooltip";
import { cn } from "@autumn/ui/lib/utils";
import type { ReactNode } from "react";

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
