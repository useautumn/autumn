import {
	Button,
	type ButtonProps,
	ConditionalTooltip,
} from "@autumn/ui";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function DisabledTooltipButton({
	disabledReason,
	tooltipClassName,
	className,
	disabled,
	...props
}: ButtonProps & {
	disabledReason?: ReactNode;
	tooltipClassName?: string;
}) {
	if (!disabledReason) {
		return <Button {...props} disabled={disabled} className={className} />;
	}

	return (
		<ConditionalTooltip
			enabled
			content={disabledReason}
			contentClassName={tooltipClassName}
		>
			<span className="flex w-full cursor-not-allowed">
				<Button
					{...props}
					disabled
					className={cn("pointer-events-none", className)}
				/>
			</span>
		</ConditionalTooltip>
	);
}
