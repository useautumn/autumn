import type { ReactElement, ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

interface ConditionalTooltipProps {
	enabled: boolean;
	content: ReactNode;
	contentClassName?: string;
	children: ReactElement;
}

export function ConditionalTooltip({
	enabled,
	content,
	contentClassName,
	children,
}: ConditionalTooltipProps) {
	if (!enabled) return children;

	return (
		<Tooltip>
			<TooltipTrigger asChild>{children}</TooltipTrigger>
			<TooltipContent className={contentClassName}>{content}</TooltipContent>
		</Tooltip>
	);
}
