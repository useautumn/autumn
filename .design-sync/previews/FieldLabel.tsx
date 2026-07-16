import { FieldLabel, Input, TooltipProvider } from "@autumn/ui";

export const Default = () => (
	<div className="flex flex-col">
		<FieldLabel>Billing interval</FieldLabel>
		<FieldLabel>Included usage</FieldLabel>
	</div>
);

export const WithDescription = () => (
	<FieldLabel description="Credits granted at the start of each billing cycle">
		Included usage
	</FieldLabel>
);

export const WithTooltip = () => (
	<TooltipProvider>
		<FieldLabel
			description="Charged per credit above the included amount"
			tooltip="Overage is invoiced at the end of the cycle, rounded to the nearest cent."
		>
			Overage rate
		</FieldLabel>
	</TooltipProvider>
);

export const AboveField = () => (
	<div className="flex flex-col">
		<FieldLabel description="Shown to customers on the pricing page">
			Plan name
		</FieldLabel>
		<Input defaultValue="Pro" />
	</div>
);
