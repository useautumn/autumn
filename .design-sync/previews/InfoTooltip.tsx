import { InfoTooltip, TooltipProvider } from "@autumn/ui";

export const Default = () => (
	<TooltipProvider>
		<div className="flex items-center gap-1.5 text-md">
			<span className="text-muted-foreground">Included usage</span>
			<InfoTooltip>
				Usage granted with the plan each billing period before overage rates
				apply.
			</InfoTooltip>
		</div>
	</TooltipProvider>
);

export const OnFormLabel = () => (
	<TooltipProvider>
		<div className="flex flex-col gap-2">
			<div className="flex items-center gap-1.5 text-md">
				<span className="text-muted-foreground">Prepaid quantity</span>
				<InfoTooltip side="right">
					The number of units the customer is billed for upfront each period.
				</InfoTooltip>
			</div>
			<div className="flex items-center gap-1.5 text-md">
				<span className="text-muted-foreground">Reset interval</span>
				<InfoTooltip side="right">
					How often the feature balance resets back to its included amount.
				</InfoTooltip>
			</div>
		</div>
	</TooltipProvider>
);

export const InTableHeader = () => (
	<TooltipProvider>
		<div className="flex items-center gap-4 border-border border-b pb-2">
			<span className="text-muted-foreground text-xs">Feature</span>
			<div className="flex items-center gap-1.5">
				<span className="text-muted-foreground text-xs">Balance</span>
				<InfoTooltip align="start">
					Remaining units before the customer is charged for overage.
				</InfoTooltip>
			</div>
		</div>
	</TooltipProvider>
);
