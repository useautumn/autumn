import { type IconProps, TicketIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

export const LicenseIcon = ({ className, ...props }: IconProps) => (
	<TicketIcon
		weight="fill"
		className={cn("text-sky-500", className)}
		{...props}
	/>
);
