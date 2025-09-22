import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { TooltipContentProps } from "@radix-ui/react-tooltip";
import { InfoIcon } from "lucide-react";

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
			<TooltipTrigger className={className}>
				<InfoIcon size={12} className="text-t3/50" />
			</TooltipTrigger>
			<TooltipContent sideOffset={10} {...props}>
				{children}
			</TooltipContent>
		</Tooltip>
	);
};
