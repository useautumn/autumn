import {
	Button,
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@autumn/ui";
import { InfoIcon } from "@phosphor-icons/react";

export const Default = () => (
	<TooltipProvider>
		<div className="flex justify-center py-8">
			<Tooltip open>
				<TooltipTrigger render={<Button variant="secondary" size="sm" />}>
					Prorate on upgrade
				</TooltipTrigger>
				<TooltipContent side="top">
					Charges the difference immediately
				</TooltipContent>
			</Tooltip>
		</div>
	</TooltipProvider>
);

export const OnIcon = () => (
	<TooltipProvider>
		<div className="flex justify-center py-8">
			<Tooltip open>
				<TooltipTrigger>
					<InfoIcon size={16} weight="fill" className="text-subtle" />
				</TooltipTrigger>
				<TooltipContent side="top">
					Usage resets on the 1st of each month
				</TooltipContent>
			</Tooltip>
		</div>
	</TooltipProvider>
);

export const SideRight = () => (
	<TooltipProvider>
		<div className="flex justify-center py-8">
			<Tooltip open>
				<TooltipTrigger render={<Button variant="secondary" size="sm" />}>
					cus_3f8Kd92Lm4
				</TooltipTrigger>
				<TooltipContent side="right">Click to copy customer ID</TooltipContent>
			</Tooltip>
		</div>
	</TooltipProvider>
);
