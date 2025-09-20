import type React from "react";
import { cn } from "@/lib/utils";
import { InfoTooltip } from "./InfoTooltip";

function FieldLabel({
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
			<div className={cn("text-t3 text-sm mb-2", className)}>{children}</div>
		);
	}
	return (
		<div className={cn("text-t3 text-sm mb-2", className)}>
			{children}
			{description && !tooltip && (
				<p className="text-t3 text-xs">{description}</p>
			)}
			{tooltip && description && (
				<div className="flex items-center gap-2">
					<p className="text-t3 text-xs">{description}</p>
					<InfoTooltip>{tooltip}</InfoTooltip>
				</div>
			)}
		</div>
	);
}

export default FieldLabel;
