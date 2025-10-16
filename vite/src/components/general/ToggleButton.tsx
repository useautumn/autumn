import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import { Switch } from "../ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { InfoTooltip } from "./modal-components/InfoTooltip";

export const ToggleButton = ({
	value,
	setValue,
	tooltipContent,
	buttonText,
	className,
	disabled,
	infoContent,
	switchClassName,
}: {
	value: boolean;
	setValue: (value: boolean) => void;
	tooltipContent?: string;
	buttonText?: string | React.ReactNode;
	className?: string;
	disabled?: boolean;
	infoContent?: string;
	switchClassName?: string;
}) => {
	const MainButton = (
		<Button
			variant="outline"
			disabled={disabled}
			onClick={(e) => {
				e.preventDefault();
				e.stopPropagation();
				setValue(!value);
			}}
			className={cn(
				`flex justify-start items-center hover:bg-transparent bg-transparent border-none shadow-none gap-2 w-fit p-0`,
				className,
			)}
		>
			{buttonText}
			<div className={cn("flex items-center gap-1", switchClassName)}>
				{infoContent && <InfoTooltip>{infoContent}</InfoTooltip>}
				<Switch
					checked={value}
					className="h-4 w-7 data-[state=checked]:bg-stone-500"
					thumbClassName="h-3 w-3 data-[state=checked]:translate-x-3"
				/>
			</div>
		</Button>
	);

	if (tooltipContent) {
		return (
			<Tooltip delayDuration={200}>
				<TooltipTrigger asChild>{MainButton}</TooltipTrigger>
				<TooltipContent>{tooltipContent}</TooltipContent>
			</Tooltip>
		);
	}

	return MainButton;
};
