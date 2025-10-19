import type { TooltipContentProps } from "@radix-ui/react-tooltip";
import { InfoIcon } from "lucide-react";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";

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
				<button type="button" className="outline-none">
					<InfoIcon size={12} className="text-t3/50" />
				</button>
			</TooltipTrigger>
			<TooltipContent sideOffset={10} {...props}>
				{children}
			</TooltipContent>
		</Tooltip>
	);
};
