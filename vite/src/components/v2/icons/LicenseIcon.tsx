import { type IconProps, TicketIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

/** Canonical icon for anything license-related — same glyph and colour
 * everywhere so the visual language stays consistent. */
export const LicenseIcon = ({ className, ...props }: IconProps) => (
	<TicketIcon
		weight="fill"
		className={cn("text-sky-500", className)}
		{...props}
	/>
);
