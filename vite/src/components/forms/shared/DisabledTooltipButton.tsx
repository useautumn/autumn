import { Button, type ButtonProps, ConditionalTooltip } from "@autumn/ui";
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
			<Button
				{...props}
				aria-disabled
				onClick={(event) => event.preventDefault()}
				className={cn("cursor-not-allowed opacity-50", className)}
			/>
		</ConditionalTooltip>
	);
}
