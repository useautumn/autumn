import {
	IconButton,
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@autumn/ui";
import { PencilSimpleIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

const TOOLTIP_DELAY_MS = 250;

export function CustomizePlanButton({
	onClick,
	isCustom = false,
	variant = "muted",
}: {
	onClick: () => void;
	isCustom?: boolean;
	variant?: "muted" | "secondary";
}) {
	return (
		<Tooltip delayDuration={TOOLTIP_DELAY_MS}>
			<TooltipTrigger asChild>
				<IconButton
					aria-label={isCustom ? "Edit custom plan" : "Customize plan"}
					className={cn(
						"size-6 shrink-0",
						isCustom
							? "bg-primary/15 text-primary hover:bg-primary/25"
							: "text-tertiary-foreground hover:text-foreground",
					)}
					icon={<PencilSimpleIcon />}
					onClick={onClick}
					size="sm"
					type="button"
					variant={variant}
				/>
			</TooltipTrigger>
			<TooltipContent side="top">
				{isCustom ? "Customized · click to edit" : "Customize plan"}
			</TooltipContent>
		</Tooltip>
	);
}
