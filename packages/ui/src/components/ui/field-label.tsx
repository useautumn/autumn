import type React from "react";
import { cn } from "../../lib/utils";
import { InfoTooltip } from "./info-tooltip";

export function FieldLabel({
	children,
	className,
	description,
	empty = false,
	tooltip,
}: {
	children: React.ReactNode;
	className?: string;
	description?: string;
	empty?: boolean;
	tooltip?: string;
}) {
	if (empty) {
		children = "\u00A0";
	}
	if (!description) {
		return (
			<div className={cn("text-tertiary-foreground text-sm mb-2", className)}>
				{children}
			</div>
		);
	}
	return (
		<div className={cn("text-tertiary-foreground text-sm mb-2", className)}>
			{children}
			{description && !tooltip && (
				<p className="text-tertiary-foreground text-xs">{description}</p>
			)}
			{tooltip && description && (
				<div className="flex items-center gap-2">
					<p className="text-tertiary-foreground text-xs">{description}</p>
					<InfoTooltip>{tooltip}</InfoTooltip>
				</div>
			)}
		</div>
	);
}
