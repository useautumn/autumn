import { InfoIcon } from "@phosphor-icons/react";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

export const InfoTooltip = ({
	children,
	className,
	...props
}: {
	children: React.ReactNode;
	className?: string;
	side?: "top" | "bottom" | "left" | "right";
	align?: "start" | "center" | "end";
	sideOffset?: number;
}) => {
	return (
		<Tooltip>
			<TooltipTrigger
				asChild
				className={className}
				tabIndex={-1}
				onFocus={(e) => e.preventDefault()}
			>
				<span className="outline-none inline-flex items-center cursor-pointer">
					<InfoIcon className="text-tertiary-foreground/50 size-3" />
				</span>
			</TooltipTrigger>
			<TooltipContent sideOffset={10} {...props} className="">
				{children}
			</TooltipContent>
		</Tooltip>
	);
};
