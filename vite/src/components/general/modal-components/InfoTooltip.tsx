import { InfoIcon } from "@phosphor-icons/react";
import type { TooltipContentProps } from "@radix-ui/react-tooltip";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/v2/tooltips/Tooltip";

export const InfoTooltip = ({
	children,
	className,
	...props
}: {
	children: React.ReactNode;
	className?: string;
} & TooltipContentProps) => {
	return (
		<Tooltip>
			<TooltipTrigger
				asChild
				className={className}
				tabIndex={-1}
				onFocus={(e) => e.preventDefault()}
			>
				<span className="outline-none inline-flex items-center cursor-pointer">
					<InfoIcon className="text-t3/50 size-3" />
				</span>
			</TooltipTrigger>
			<TooltipContent sideOffset={10} {...props} className="">
				{children}
			</TooltipContent>
		</Tooltip>
	);
};
